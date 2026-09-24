import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:http/http.dart' as http;
import '../suite.dart';
import '../widgets/record_form.dart';

class HospitalOperations extends StatefulWidget {
  final SuiteStore store;
  const HospitalOperations({super.key, required this.store});
  @override
  State<HospitalOperations> createState() => _HospitalOperationsState();
}
class _HospitalOperationsState extends State<HospitalOperations> {
  late Future<Map<String, dynamic>> overview = widget.store.call('hospitalStaffOverview');
  bool busy = false;
  String? error;
  Future<void> run(Future<void> Function() work) async {
    setState(() { busy = true; error = null; });
    try { await work(); if (mounted) setState(() => overview = widget.store.call('hospitalStaffOverview')); }
    catch (e) { if (mounted) setState(() => error = e.toString()); }
    finally { if (mounted) setState(() => busy = false); }
  }
  Future<void> service() => run(() async {
    final fields = await recordForm(context, 'Hospital service', ['Service name / doctor', 'Type: appointment or labTest', 'Price in KES minor units']);
    if (fields == null) return;
    await widget.store.call('hospitalSaveService', {'name': fields[0], 'kind': fields[1], 'priceMinor': int.tryParse(fields[2])});
  });
  Future<void> report() => run(() async {
    final fields = await recordForm(context, 'Upload lab report', ['Patient ID', 'Report name']);
    if (fields == null) return;
    final selection = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: ['pdf'], withData: true);
    if (selection == null) return;
    final bytes = selection.files.single.bytes;
    if (bytes == null || bytes.length > 20 * 1024 * 1024) throw StateError('Select a PDF up to 20 MB');
    final upload = await widget.store.call('hospitalPrepareReport', {'patientId': fields[0], 'name': fields[1]});
    final result = await http.put(Uri.parse(upload['url'] as String), headers: {'Content-Type': 'application/pdf'}, body: bytes).timeout(const Duration(minutes: 2));
    if (result.statusCode < 200 || result.statusCode >= 300) throw StateError('PDF upload failed; report was not published');
    await widget.store.call('hospitalFinalizeReport', {'id': upload['id']});
  });
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('Hospital operations')),
    body: ListView(padding: const EdgeInsets.all(24), children: [
      if (busy) const LinearProgressIndicator(),
      if (error != null) Text(error!),
      Wrap(spacing: 12, children: [FilledButton(onPressed: busy ? null : service, child: const Text('Add service')), FilledButton(onPressed: busy ? null : report, child: const Text('Upload lab report'))]),
      FutureBuilder<Map<String, dynamic>>(future: overview, builder: (context, snapshot) {
        if (snapshot.hasError) return Text('Could not load operations: ${snapshot.error}');
        if (!snapshot.hasData) return const LinearProgressIndicator();
        final services = snapshot.data!['services'] as List? ?? [];
        final bookings = snapshot.data!['bookings'] as List? ?? [];
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const SizedBox(height: 20), const Text('Services (up to 200)'),
          for (final s in services) SwitchListTile(title: Text('${s['name']}'), subtitle: Text('${s['kind']} · KES ${(s['priceMinor'] / 100).toStringAsFixed(2)}'), value: s['active'] == true,
            onChanged: busy ? null : (value) => run(() async { await widget.store.call('hospitalSaveService', {...Map<String, dynamic>.from(s as Map), 'active': value}); })),
          const SizedBox(height: 20), const Text('Bookings from the latest 100 clinical records'),
          for (final b in bookings) ListTile(title: Text('${b['name']} · ${b['status']}'), subtitle: Text('${b['patientId']} · ${b['scheduledAt']}'),
            trailing: ['requested', 'confirmed'].contains(b['status']) ? PopupMenuButton<String>(enabled: !busy, onSelected: (value) => run(() async { await widget.store.call('hospitalSetBookingStatus', {'id': b['id'], 'status': value}); }),
              itemBuilder: (_) => const [PopupMenuItem(value: 'confirmed', child: Text('Confirm')), PopupMenuItem(value: 'completed', child: Text('Complete'))]) : null),
        ]);
      }),
    ]),
  );
}
