import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../suite.dart';
import '../widgets/record_form.dart';
import 'agentic_matching.dart';

class SupplierMarketplaceTab extends StatefulWidget {
  final SuiteStore store;

  const SupplierMarketplaceTab({super.key, required this.store});

  @override
  State<SupplierMarketplaceTab> createState() => _SupplierMarketplaceTabState();
}

class _SupplierMarketplaceTabState extends State<SupplierMarketplaceTab> {
  FirebaseFirestore get _db => FirebaseFirestore.instance;

  Future<void> _publishSupplierListing() async {
    final details = await recordForm(
      context,
      'Connect supplier profile',
      [
        'Categories (stock, equipment, service)',
        'Products supplied (comma separated)',
        'Equipment supplied (comma separated)',
        'Services offered (comma separated)',
        'Service regions (comma separated)',
        'Capacity per request',
      ],
    );
    if (details == null || !mounted) return;
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      _message('Sign in to publish a supplier profile.');
      return;
    }

    final organization = await _db.doc('organizations/${widget.store.orgId}').get();
    final organizationName =
        organization.data()?['name']?.toString() ?? 'Workspace ${widget.store.orgId}';
    final listingRef = _db
        .collection('marketplaceSupplierListings')
        .doc(widget.store.orgId);
    final current = await listingRef.get();

    try {
      await listingRef.set({
        'supplierOrgId': widget.store.orgId,
        'organizationName': organizationName,
        'categories': _split(details[0]),
        'products': _split(details[1]),
        'equipment': _split(details[2]),
        'services': _split(details[3]),
        'regions': _split(details[4]),
        'capacity': int.tryParse(details[5]) ?? 0,
        'published': true,
        'createdAt': current.data()?['createdAt'] ?? FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });
      _message('Supplier profile is live in the marketplace.');
    } catch (error) {
      _message('Could not publish supplier profile: $error');
    }
  }

  Future<void> _requestQuote(
    OperationalGap gap,
    SupplierMatch match,
  ) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      _message('Sign in to contact a supplier.');
      return;
    }
    final supplier = match.supplier;
    final request = _db.collection('marketplaceQuoteRequests').doc();
    try {
      await request.set({
        'buyerOrgId': widget.store.orgId,
        'supplierOrgId': supplier['supplierOrgId'],
        'supplierName': supplier['organizationName'],
        'createdBy': user.uid,
        'gapKind': gap.kind,
        'gapTitle': gap.title,
        'gapDetail': gap.detail,
        'location': gap.location,
        'quantity': gap.quantity,
        'matchScore': match.score,
        'matchReasons': match.reasons,
        'status': 'OPEN',
        'createdAt': FieldValue.serverTimestamp(),
      });
      _message('Quote request sent to ${supplier['organizationName']}.');
    } catch (error) {
      _message('Could not send quote request: $error');
    }
  }

  void _message(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
    children: [
      _marketplaceHeader(),
      const SizedBox(height: 16),
      _buildSupplierDirectory(),
      const SizedBox(height: 20),
      _buildGapAnalysis(),
      const SizedBox(height: 20),
      _buildIncomingRequests(),
    ],
  );

  Widget _marketplaceHeader() => Card(
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.hub_rounded, color: Color(0xFF0F766E)),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Agentic supplier marketplace',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          const Text(
            'Find stock, equipment, and service gaps from your live operations; compare supplier fit and request a quote for human approval.',
            style: TextStyle(color: Color(0xFF64748B)),
          ),
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              onPressed: _publishSupplierListing,
              icon: const Icon(Icons.storefront_rounded),
              label: const Text('Publish / update supplier profile'),
            ),
          ),
        ],
      ),
    ),
  );

  Widget _buildSupplierDirectory() => StreamBuilder<
    QuerySnapshot<Map<String, dynamic>>
  >(
    stream: _db
        .collection('marketplaceSupplierListings')
        .where('published', isEqualTo: true)
        .limit(100)
        .snapshots(),
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return _sectionError('Supplier directory unavailable: ${snapshot.error}');
      }
      if (!snapshot.hasData) {
        return const Center(child: CircularProgressIndicator());
      }
      final suppliers = snapshot.data!.docs
          .where((document) => document.id != widget.store.orgId)
          .map((document) => <String, dynamic>{...document.data(), 'id': document.id})
          .toList(growable: false);
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionTitle('Supplier directory', '${suppliers.length} published'),
          const SizedBox(height: 8),
          if (suppliers.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Text('No other organizations have published supplier offers yet.'),
              ),
            )
          else
            ...suppliers.map(_supplierCard),
        ],
      );
    },
  );

  Widget _supplierCard(Map<String, dynamic> supplier) {
    final offers = [
      ..._asStrings(supplier['products']),
      ..._asStrings(supplier['equipment']),
      ..._asStrings(supplier['services']),
    ];
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      child: ListTile(
        leading: const CircleAvatar(child: Icon(Icons.storefront_rounded)),
        title: Text(
          supplier['organizationName']?.toString() ?? 'Supplier',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Text(
          '${supplier['location'] ?? 'Location not set'} · ${offers.take(4).join(', ')}',
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: Text('${supplier['capacity'] ?? '—'} cap.'),
      ),
    );
  }

  Widget _buildGapAnalysis() => StreamBuilder<List<Map<String, dynamic>>>(
    stream: widget.store.watch('apps'),
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return _sectionError('Could not read installed apps: ${snapshot.error}');
      }
      if (!snapshot.hasData) {
        return const Center(child: CircularProgressIndicator());
      }
      final installed = snapshot.data!
          .map((app) => app['id']?.toString() ?? '')
          .toSet();
      final paths = <String>[
        if (installed.contains('inventory') || installed.contains('pos')) 'products',
        if (installed.contains('assets')) 'assets',
        if (installed.contains('fieldservice')) 'field_dispatches',
      ];
      if (paths.isEmpty) {
        return _sectionError(
          'Install Inventory, Fixed Asset Register, or Field Service to analyze stock, equipment, and service gaps.',
        );
      }
      return _readGapSources(paths, 0, <String, List<Map<String, dynamic>>>{});
    },
  );

  Widget _readGapSources(
    List<String> paths,
    int index,
    Map<String, List<Map<String, dynamic>>> records,
  ) {
    if (index >= paths.length) return _gapResults(records);
    final path = paths[index];
    return StreamBuilder<List<Map<String, dynamic>>>(
      stream: widget.store.watch(path),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return _sectionError(
            'Unable to analyze $path. Check that your workspace has access to that app.',
          );
        }
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        return _readGapSources(
          paths,
          index + 1,
          {...records, path: snapshot.data!},
        );
      },
    );
  }

  Widget _gapResults(Map<String, List<Map<String, dynamic>>> records) {
    final gaps = detectOperationalGaps(
      products: records['products'] ?? const [],
      assets: records['assets'] ?? const [],
      serviceRequests: records['field_dispatches'] ?? const [],
    );
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: _db
          .collection('marketplaceSupplierListings')
          .where('published', isEqualTo: true)
          .limit(100)
          .snapshots(),
      builder: (context, snapshot) {
        final suppliers = snapshot.data?.docs
                .map((document) => <String, dynamic>{...document.data(), 'id': document.id})
                .toList(growable: false) ??
            const <Map<String, dynamic>>[];
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _sectionTitle('Operational gap analysis', '${gaps.length} signals'),
            const SizedBox(height: 6),
            const Text(
              'Signals use reorder levels, asset condition, and unassigned service requests. Match scores show evidence, not purchasing decisions.',
              style: TextStyle(color: Color(0xFF64748B), fontSize: 12),
            ),
            const SizedBox(height: 8),
            if (gaps.isEmpty)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: Text('No current stock, equipment, or service gaps were detected.'),
                ),
              ),
            for (final gap in gaps) _gapCard(gap, suppliers),
          ],
        );
      },
    );
  }

  Widget _gapCard(OperationalGap gap, List<Map<String, dynamic>> suppliers) {
    final matches = rankSuppliers(gap, suppliers).take(3).toList();
    return Card(
      margin: const EdgeInsets.only(top: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Chip(label: Text(gap.kind)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    gap.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
            Text('${gap.detail} · ${gap.location.isEmpty ? 'Location not set' : gap.location}'),
            const SizedBox(height: 10),
            if (matches.isEmpty)
              const Text('No matching supplier yet. Publish a supplier profile to participate.'),
            for (final match in matches)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(
                  '${match.supplier['organizationName'] ?? 'Supplier'} · ${match.score}% fit',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                subtitle: Text(match.reasons.join(' · ')),
                trailing: IconButton(
                  tooltip: 'Request a quote',
                  onPressed: () => _requestQuote(gap, match),
                  icon: const Icon(Icons.outgoing_mail),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildIncomingRequests() {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return const SizedBox.shrink();
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: _db
          .collection('marketplaceQuoteRequests')
          .where('supplierOrgId', isEqualTo: widget.store.orgId)
          .limit(30)
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return _sectionError('Could not load supplier requests: ${snapshot.error}');
        }
        final requests = snapshot.data?.docs ?? const [];
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _sectionTitle('Incoming quote requests', '${requests.length} requests'),
            for (final request in requests)
              Card(
                child: ListTile(
                  title: Text('${request.data()['buyerOrgId']} · ${request.data()['gapTitle']}'),
                  subtitle: Text('${request.data()['gapDetail']} · Fit ${request.data()['matchScore']}%'),
                  trailing: Text(request.data()['status']?.toString() ?? 'OPEN'),
                ),
              ),
          ],
        );
      },
    );
  }

  Widget _sectionTitle(String title, String trailing) => Row(
    children: [
      Expanded(
        child: Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
      ),
      Text(trailing, style: const TextStyle(color: Color(0xFF64748B))),
    ],
  );

  Widget _sectionError(String text) => Card(
    child: Padding(padding: const EdgeInsets.all(14), child: Text(text)),
  );

  List<String> _split(String text) => text
      .split(RegExp(r'[,;|]'))
      .map((item) => item.trim())
      .where((item) => item.isNotEmpty)
      .take(40)
      .toList(growable: false);

  List<String> _asStrings(Object? value) {
    if (value is Iterable) return value.map((item) => item.toString()).toList();
    if (value == null) return const [];
    return value.toString().split(RegExp(r'[,;|]'));
  }
}
