import 'dart:async';
import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import 'suite.dart';

/// A drop-in production store that reduces Firestore and Functions cost without
/// changing module APIs.
///
/// Cost controls:
/// - every live collection query is bounded;
/// - identical collection listeners are shared across widgets;
/// - the upstream Firestore listener is detached when the last subscriber
///   leaves;
/// - read-only callable responses are cached briefly;
/// - identical in-flight read callables are de-duplicated;
/// - any mutation invalidates the callable cache so the UI does not retain
///   stale data after writes.
class CostAwareFirebaseSuiteStore extends SuiteStore {
  @override
  final String orgId;

  CostAwareFirebaseSuiteStore(this.orgId);

  static const int _defaultLiveLimit = int.fromEnvironment(
    'FIRESTORE_LIVE_QUERY_LIMIT',
    defaultValue: 200,
  );
  static const int _defaultReadCacheSeconds = int.fromEnvironment(
    'FIREBASE_READ_CACHE_SECONDS',
    defaultValue: 20,
  );

  final Map<String, _SharedCollectionWatch> _watches = {};
  final Map<String, _CachedCallable> _callCache = {};
  final Map<String, Future<Map<String, dynamic>>> _inflightReads = {};

  int listenerStarts = 0;
  int listenerReuses = 0;
  int observedDocuments = 0;
  int callableCacheHits = 0;
  int callableDeduplications = 0;
  int callableNetworkRequests = 0;

  @override
  bool get demo => false;

  FirebaseFunctions get _functions =>
      FirebaseFunctions.instanceFor(region: 'europe-west1');

  Duration? _cacheTtl(String name) {
    if (name == 'getCatalog') return const Duration(minutes: 5);
    if (name == 'getWorkspaceContext') return const Duration(minutes: 2);
    if (name == 'getFirebaseCostPolicy') return const Duration(minutes: 5);
    if (name.startsWith('get')) {
      return Duration(seconds: _defaultReadCacheSeconds.clamp(0, 300));
    }
    return null;
  }

  String _canonicalJson(Object? value) {
    Object? normalize(Object? input) {
      if (input is Map) {
        final keys = input.keys.map((key) => key.toString()).toList()..sort();
        return <String, Object?>{
          for (final key in keys) key: normalize(input[key]),
        };
      }
      if (input is Iterable) return input.map(normalize).toList(growable: false);
      return input;
    }

    return jsonEncode(normalize(value));
  }

  String _callKey(String name, Map<String, dynamic> data) =>
      '$name:${_canonicalJson(data)}';

  @override
  Future<Map<String, dynamic>> call(
    String name, [
    Map<String, dynamic> data = const {},
  ]) async {
    final ttl = _cacheTtl(name);
    final payload = <String, dynamic>{'orgId': orgId, ...data};
    if (ttl == null || ttl == Duration.zero) {
      _callCache.clear();
      callableNetworkRequests += 1;
      final result = await _functions.httpsCallable(name).call(payload);
      return Map<String, dynamic>.from(result.data as Map);
    }

    final key = _callKey(name, data);
    final cached = _callCache[key];
    if (cached != null && cached.expiresAt.isAfter(DateTime.now())) {
      callableCacheHits += 1;
      return Map<String, dynamic>.from(cached.value);
    }

    final pending = _inflightReads[key];
    if (pending != null) {
      callableDeduplications += 1;
      return pending;
    }

    final request = () async {
      callableNetworkRequests += 1;
      final result = await _functions.httpsCallable(name).call(payload);
      final value = Map<String, dynamic>.from(result.data as Map);
      _callCache[key] = _CachedCallable(
        value,
        DateTime.now().add(ttl),
      );
      return value;
    }();
    _inflightReads[key] = request;
    try {
      return await request;
    } finally {
      _inflightReads.remove(key);
    }
  }

  int _limitForPath(String path) {
    if (path == 'websiteAnalyticsDaily') return 90;
    if (path == 'websiteDomains') return 100;
    if (path == 'websiteAssets') return 100;
    if (path == 'websiteFormSubmissions' || path == 'websiteFormSpam') return 100;
    if (path == 'websiteExperimentStats') return 200;
    if (path == 'businessGraphNodes' || path == 'businessGraphEdges') return 300;
    if (path.contains('/presence')) return 50;
    return _defaultLiveLimit.clamp(25, 500);
  }

  @override
  Stream<List<Map<String, dynamic>>> watch(String path) {
    final limit = _limitForPath(path);
    final key = '$path:$limit';
    final existing = _watches[key];
    if (existing != null) {
      listenerReuses += 1;
      return existing.stream;
    }

    final watch = _SharedCollectionWatch(
      query: FirebaseFirestore.instance
          .collection('organizations/$orgId/$path')
          .limit(limit),
      onStart: () => listenerStarts += 1,
      onDocuments: (count) => observedDocuments += count,
    );
    _watches[key] = watch;
    return watch.stream;
  }

  Map<String, int> get localCostDiagnostics => {
        'listenerStarts': listenerStarts,
        'listenerReuses': listenerReuses,
        'observedDocuments': observedDocuments,
        'callableCacheHits': callableCacheHits,
        'callableDeduplications': callableDeduplications,
        'callableNetworkRequests': callableNetworkRequests,
      };

  @override
  void dispose() {
    for (final watch in _watches.values) {
      watch.dispose();
    }
    _watches.clear();
    _callCache.clear();
    _inflightReads.clear();
    super.dispose();
  }
}

class _CachedCallable {
  final Map<String, dynamic> value;
  final DateTime expiresAt;

  const _CachedCallable(this.value, this.expiresAt);
}

class _SharedCollectionWatch {
  final Query<Map<String, dynamic>> query;
  final void Function() onStart;
  final void Function(int count) onDocuments;

  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _subscription;
  late final StreamController<List<Map<String, dynamic>>> _controller;

  _SharedCollectionWatch({
    required this.query,
    required this.onStart,
    required this.onDocuments,
  }) {
    _controller = StreamController<List<Map<String, dynamic>>>.broadcast(
      onListen: _start,
      onCancel: _stop,
    );
  }

  Stream<List<Map<String, dynamic>>> get stream => _controller.stream;

  void _start() {
    if (_subscription != null) return;
    onStart();
    _subscription = query.snapshots().listen(
      (snapshot) {
        onDocuments(snapshot.docs.length);
        _controller.add(
          snapshot.docs
              .map((doc) => <String, dynamic>{...doc.data(), 'id': doc.id})
              .toList(growable: false),
        );
      },
      onError: _controller.addError,
    );
  }

  void _stop() {
    final subscription = _subscription;
    _subscription = null;
    if (subscription != null) unawaited(subscription.cancel());
  }

  void dispose() {
    _stop();
    unawaited(_controller.close());
  }
}
