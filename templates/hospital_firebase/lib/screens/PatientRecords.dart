import 'dart:math';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/HospitalService.dart';

class PatientRecords extends StatefulWidget {
  final String kind;
  final String title;
  final HospitalService? service;
  const PatientRecords({super.key, required this.kind, required this.title, this.service});
  @override
  State<PatientRecords> createState() => _PatientRecordsState();
}
class _PatientRecordsState extends State<PatientRecords> {
  late final api = widget.service ?? HospitalService();
  late Future<List<Map<String, dynamic>>> rows = api.list(widget.kind == 'bills');
  bool busy = false;
  String? error;
  void reload() => setState(() => rows = api.list(widget.kind == 'bills'));
  Future<void> run(Future<void> Function() action) async {
    if (busy) return;
    setState(() { busy = true; error = null; });
    try { await action(); if (mounted) reload(); }
    catch (e) { if (mounted) setState(() => error = e.toString()); }
    finally { if (mounted) setState(() => busy = false); }
  }
  Future<DateTime?> chooseTime() async {
    final now = DateTime.now();
    final date = await showDatePicker(context: context, initialDate: now.add(const Duration(days: 1)), firstDate: now, lastDate: now.add(const Duration(days: 365)));
    if (date == null || !mounted) return null;
    final time = await showTimePicker(context: context, initialTime: const TimeOfDay(hour: 9, minute: 0));
    return time == null ? null : DateTime(date.year, date.month, date.day, time.hour, time.minute);
  }
  Future<void> book() => run(() async {
    final result = await api.call('hospitalListServices');
    final services = (result['services'] as List).where((s) => s['kind'] == widget.kind).toList();
    if (!mounted) return;
    if (services.isEmpty) throw StateError('No services are currently available. Contact the hospital.');
    final service = await showDialog<Map>(context: context, builder: (context) => SimpleDialog(title: const Text('Choose a service'), children: [
      for (final s in services) SimpleDialogOption(onPressed: () => Navigator.pop(context, s), child: Text('${s['name']} — KES ${(s['priceMinor'] / 100).toStringAsFixed(2)}')),
    ]));
    if (service == null || !mounted) return;
    final date = await chooseTime();
    if (date == null) return;
    final id = '${DateTime.now().microsecondsSinceEpoch}_${Random.secure().nextInt(1 << 32)}';
    await api.call('hospitalBook', {'requestId': id, 'kind': widget.kind, 'serviceId': service['id'], 'scheduledAt': date.toUtc().toIso8601String()});
  });
  Future<void> openUrl(String value) async {
    final url = Uri.parse(value);
    if (url.scheme != 'https' || !await launchUrl(url, mode: LaunchMode.externalApplication)) throw StateError('Could not open secure link');
  }
  Future<void> pay(Map<String, dynamic> bill, String provider) => run(() async {
    String? phone;
    if (provider == 'mpesa') {
      final controller = TextEditingController();
      phone = await showDialog<String>(context: context, builder: (context) => AlertDialog(title: const Text('M-Pesa phone'), content: TextField(controller: controller, keyboardType: TextInputType.phone, decoration: const InputDecoration(hintText: '2547XXXXXXXX')),
        actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(context, controller.text.trim()), child: const Text('Request payment'))]));
      await Future<void>.delayed(const Duration(milliseconds: 300)); controller.dispose();
      if (phone == null) return;
    }
    final result = await api.call('hospitalStartPayment', {'invoiceId': bill['id'], 'provider': provider, if (phone != null) 'phone': phone});
    if (result['url'] != null) await openUrl(result['url'] as String);
  });
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(widget.title), actions: [IconButton(onPressed: busy ? null : reload, icon: const Icon(Icons.refresh))]),
    floatingActionButton: ['appointment', 'labTest'].contains(widget.kind) ? FloatingActionButton.extended(onPressed: busy ? null : book, label: const Text('Book'), icon: const Icon(Icons.add)) : null,
    body: Column(children: [
      if (busy) const LinearProgressIndicator(),
      if (error != null) Padding(padding: const EdgeInsets.all(12), child: Text(error!)),
      Expanded(child: FutureBuilder<List<Map<String, dynamic>>>(future: rows, builder: (context, snapshot) {
        if (snapshot.hasError) return Center(child: Text('Could not load records: ${snapshot.error}'));
        if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
        final visible = snapshot.data!.where((r) => widget.kind == 'bills' || widget.kind == 'history' || r['kind'] == widget.kind).toList();
        if (visible.isEmpty) return const Center(child: Text('No records yet'));
        return ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 100), children: [for (final row in visible) Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${row['name'] ?? ''}', style: Theme.of(context).textTheme.titleMedium),
          for (final key in ['scheduledAt', 'status', 'medicine', 'instructions', 'notes']) if (row[key] != null) Text('$key: ${row[key]}'),
          if (widget.kind == 'bills') ...[
            Text('${row['currency']} ${((row['total'] as num) / 100).toStringAsFixed(2)} · ${row['paymentState']}'),
            if (row['paymentState'] == 'unpaid' && row['reference'] == null) Wrap(children: [
              TextButton(onPressed: busy ? null : () => pay(row, 'paystack'), child: const Text('Pay with Paystack')),
              TextButton(onPressed: busy ? null : () => pay(row, 'mpesa'), child: const Text('Pay with M-Pesa')),
            ]),
            if (row['reference'] != null && row['paymentState'] != 'paid') TextButton(onPressed: busy ? null : () => run(() async {
              final result = await api.call('hospitalCheckPayment', {'reference': row['reference']});
              if (result['url'] != null) await openUrl(result['url'] as String);
              if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Payment: ${result['state']}')));
            }), child: const Text('Check / resume payment')),
          ],
          if (row['kind'] == 'prescription') TextButton(onPressed: busy || row['received'] == true ? null : () => run(() async { await api.call('hospitalReceivePrescription', {'id': row['id']}); }), child: Text(row['received'] == true ? 'Received' : 'Mark received')),
          if (row['kind'] == 'labReport') TextButton(onPressed: busy ? null : () => run(() async { final result = await api.call('hospitalReportDownload', {'id': row['id']}); await openUrl(result['url'] as String); }), child: const Text('Open PDF report')),
          if (['appointment', 'labTest'].contains(row['kind']) && ['requested', 'confirmed'].contains(row['status'])) Wrap(children: [
            TextButton(onPressed: busy ? null : () => run(() async { final time = await chooseTime(); if (time != null) await api.call('hospitalUpdateBooking', {'id': row['id'], 'scheduledAt': time.toUtc().toIso8601String()}); }), child: const Text('Reschedule')),
            TextButton(onPressed: busy ? null : () => run(() async { await api.call('hospitalUpdateBooking', {'id': row['id'], 'cancel': true}); }), child: const Text('Cancel booking')),
          ]),
        ])))],);
      })),
    ]),
  );
}
