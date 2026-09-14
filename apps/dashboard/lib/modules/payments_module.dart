import 'package:flutter/material.dart';
import '../suite.dart';

class PaymentsModuleScreen extends StatefulWidget {
  final SuiteStore store;

  const PaymentsModuleScreen({super.key, required this.store});

  @override
  State<PaymentsModuleScreen> createState() => _PaymentsModuleScreenState();
}

class _PaymentsModuleScreenState extends State<PaymentsModuleScreen> {
  final TextEditingController _phoneController = TextEditingController(text: '254712345678');
  final TextEditingController _amountController = TextEditingController(text: '5000');
  bool _testingStk = false;

  @override
  void dispose() {
    _phoneController.dispose();
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _triggerStkPush() async {
    if (_testingStk || !widget.store.demo) return;
    setState(() => _testingStk = true);
    try {
      final amountKes = (double.tryParse(_amountController.text) ?? 100) * 100;
      final res = await widget.store.call('triggerMpesaStk', {
        'phone': _phoneController.text.trim(),
        'amount': amountKes.round(),
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Demo STK simulation: ${res['message']}'),
            backgroundColor: const Color(0xFF16A34A),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _testingStk = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.payments_rounded, color: Color(0xFF16A34A)),
            SizedBox(width: 10),
            Text('M-Pesa & Paystack Payments Hub'),
          ],
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: widget.store.demo
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'M-PESA STK DEMO SIMULATOR',
                            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: Color(0xFF16A34A)),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            'Preview-only simulator. It does not contact Safaricom or collect real merchant payments.',
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                child: TextField(
                                  controller: _phoneController,
                                  decoration: const InputDecoration(labelText: 'Demo phone (e.g. 254712345678)'),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: TextField(
                                  controller: _amountController,
                                  decoration: const InputDecoration(labelText: 'Demo amount (KES)'),
                                ),
                              ),
                              const SizedBox(width: 12),
                              ElevatedButton.icon(
                                onPressed: _testingStk ? null : _triggerStkPush,
                                icon: const Icon(Icons.send_to_mobile_rounded),
                                label: Text(_testingStk ? 'Simulating...' : 'Simulate STK'),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFF16A34A),
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                                ),
                              ),
                            ],
                          ),
                        ],
                      )
                    : const Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'MERCHANT CHECKOUT NOT YET ENABLED',
                            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                          ),
                          SizedBox(height: 8),
                          Text(
                            'Production M-Pesa currently supports verified Tandao subscription billing. '
                            'Merchant POS checkout remains disabled until reconciliation, refunds and dispute handling are implemented.',
                          ),
                        ],
                      ),
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              'PAYMENT RECONCILIATION LOG',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B)),
            ),
            const SizedBox(height: 12),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: widget.store.watch('payments'),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const CircularProgressIndicator();
                final payments = snapshot.data!;
                return Card(
                  child: ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: payments.length,
                    separatorBuilder: (context, index) => const Divider(height: 1),
                    itemBuilder: (context, idx) {
                      final p = payments[idx];
                      final provider = p['provider']?.toString() ?? 'Payment';
                      final receipt = p['receipt']?.toString() ?? p['reference']?.toString() ?? 'Pending';
                      final type = p['type']?.toString() ?? 'Subscription';
                      final phone = p['phone']?.toString() ?? '—';
                      final state = p['state']?.toString() ?? 'pending';
                      final total = p['total'] is num ? p['total'] as num : 0;
                      return ListTile(
                        leading: CircleAvatar(
                          backgroundColor: const Color(0xFF16A34A).withValues(alpha: 0.1),
                          child: const Icon(Icons.receipt_rounded, color: Color(0xFF16A34A)),
                        ),
                        title: Text('$provider · Receipt: $receipt', style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('Type: $type · Phone: $phone'),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(kes(total), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                            const SizedBox(width: 12),
                            Chip(label: Text(state)),
                          ],
                        ),
                      );
                    },
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
