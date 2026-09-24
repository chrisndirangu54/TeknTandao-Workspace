import 'package:cloud_functions/cloud_functions.dart';

class HospitalService {
  static const orgId = String.fromEnvironment('TANDAO_ORG_ID');
  Future<Map<String, dynamic>> call(String name, [Map<String, dynamic> data = const {}]) async {
    if (orgId.isEmpty) throw StateError('Set TANDAO_ORG_ID before running the patient portal');
    final result = await FirebaseFunctions.instanceFor(region: 'europe-west1')
        .httpsCallable(name).call({...data, 'orgId': orgId});
    return Map<String, dynamic>.from(result.data as Map);
  }
  Future<List<Map<String, dynamic>>> list(bool bills) async {
    final result = <Map<String, dynamic>>[];
    String? cursor;
    do {
      final page = await call(bills ? 'hospitalListBills' : 'hospitalListRecords', {if (cursor != null) 'cursor': cursor});
      result.addAll((page[bills ? 'bills' : 'records'] as List).map((row) => Map<String, dynamic>.from(row as Map)));
      cursor = page['cursor'] as String?;
    } while (cursor != null);
    return result;
  }
}
