import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

class AccountingModuleScreen extends StatefulWidget {
  final SuiteStore store;
  const AccountingModuleScreen({super.key, required this.store});
  @override
  State<AccountingModuleScreen> createState() => _AccountingModuleScreenState();
}

class _AccountingModuleScreenState extends State<AccountingModuleScreen> {
  String? selected;
  String? error;
  bool busy = false;

  Future<void> run(Future<void> Function() work) async {
    setState(() { busy = true; error = null; });
    try { await work(); }
    catch (e) { if (mounted) setState(() => error = e.toString()); }
    finally { if (mounted) setState(() => busy = false); }
  }

  String requestId(String prefix) => '${prefix}_${DateTime.now().microsecondsSinceEpoch}';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(children: [
          Icon(Icons.receipt_long_rounded, color: Color(0xFF8B5CF6)),
          SizedBox(width: 10),
          Text('Books & Accounting Ledger'),
        ]),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('LEDGER, INVOICES, REVERSALS & NETTING', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
          const SizedBox(height: 8),
          const Text('Sales, credit notes, hospital payments and statutory payroll post balanced KES journals. eTIMS filing and production M-Pesa settlement stay closed until those providers are certified.'),
          const SizedBox(height: 8),
          FutureBuilder<Map<String, dynamic>>(
            future: widget.store.call('getTrialBalance'),
            builder: (context, snapshot) {
              if (snapshot.hasError) return Text('Trial balance unavailable: ${snapshot.error}');
              if (!snapshot.hasData) return const LinearProgressIndicator();
              final rows = (snapshot.data!['rows'] as List?) ?? const [];
              if (rows.isEmpty) return const Text('No journal entries yet.');
              return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(snapshot.data!['truncated'] == true ? 'Trial balance of the latest 500 journals' : 'Trial balance'),
                for (final row in rows) Text('${row['account']} ${row['name']}: ${kes((row['balance'] as num?) ?? 0)}'),
              ]);
            },
          ),
          const SizedBox(height: 8),
          const Text('Reversal cancels an unpaid invoice and keeps a linked contra entry. A credit note stays open until it is netted against another open balance for the same customer or patient. This is not a statutory tax or payroll calculation.'),
          const SizedBox(height: 12),
          if (busy) const LinearProgressIndicator(),
          if (error != null) Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          Wrap(spacing: 12, children: [
            FilledButton(onPressed: busy ? null : () => run(() async {
              final fields = await recordForm(context, 'Credit note', ['Name', 'Party type: contact or patient', 'Party ID', 'Amount in minor units']);
              if (fields == null) return;
              final party = fields[1].trim();
              if (party != 'contact' && party != 'patient') throw StateError('Party type must be contact or patient');
              await widget.store.call('issueCreditNote', {
                'requestId': requestId('credit'),
                'name': fields[0],
                if (party == 'contact') 'contactId': fields[2].trim(),
                if (party == 'patient') 'patientId': fields[2].trim(),
                'total': int.tryParse(fields[3].trim()),
              });
            }), child: const Text('Issue credit note')),
          ]),
          const SizedBox(height: 12),
          StreamBuilder<List<Map<String, dynamic>>>(
            stream: widget.store.watch('invoices'),
            builder: (context, snapshot) {
              if (snapshot.hasError) return Text('Could not load invoices: ${snapshot.error}');
              if (!snapshot.hasData) return const CircularProgressIndicator();
              final invoices = snapshot.data!;
              if (invoices.isEmpty) return const Text('No invoices yet. POS sales create draft invoices when Books is installed.');
              return Card(child: ListView.separated(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: invoices.length,
                separatorBuilder: (context, index) => const Divider(height: 1),
                itemBuilder: (context, idx) {
                  final inv = invoices[idx];
                  final total = (inv['total'] ?? inv['amount'] ?? 0) as num;
                  final state = '${inv['paymentState'] ?? inv['status'] ?? 'open'}';
                  final open = state == 'unpaid' || state == 'draft' || state == 'reversal';
                  return ListTile(
                    selected: selected == inv['id'],
                    leading: CircleAvatar(
                      backgroundColor: const Color(0xFF8B5CF6).withValues(alpha: 0.1),
                      child: const Icon(Icons.description_rounded, color: Color(0xFF8B5CF6)),
                    ),
                    title: Text('${inv['name'] ?? inv['customer'] ?? inv['id']}', style: const TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: Text('$state · ${inv['currency'] ?? 'KES'} · ${inv['contactId'] ?? inv['patientId'] ?? ''}'),
                    trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                      Text(kes(total), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                      if (state == 'unpaid' || state == 'draft') TextButton(onPressed: busy ? null : () => run(() => widget.store.call('reverseInvoice', {'invoiceId': inv['id'], 'requestId': requestId('rev')})), child: const Text('Reverse')),
                      if (open) TextButton(onPressed: busy ? null : () async {
                        if (selected == null || selected == inv['id']) { setState(() => selected = inv['id'] as String?); return; }
                        final other = selected!;
                        setState(() => selected = null);
                        await run(() => widget.store.call('netInvoices', {'leftId': other, 'rightId': inv['id'], 'requestId': requestId('net')}));
                      }, child: Text(selected == inv['id'] ? 'Selected' : 'Net')),
                    ]),
                  );
                },
              ));
            },
          ),
        ]),
      ),
    );
  }
}
