import 'package:flutter/material.dart';
import '../suite.dart';

class PosModuleScreen extends StatefulWidget {
  final SuiteStore store;

  const PosModuleScreen({super.key, required this.store});

  @override
  State<PosModuleScreen> createState() => _PosModuleScreenState();
}

class _PosModuleScreenState extends State<PosModuleScreen> {
  final List<Map<String, dynamic>> _cart = [];
  String _customerName = 'Wanjiku Enterprise Ltd';
  String _selectedPaymentMethod = 'M-Pesa STK';
  String _mpesaPhone = '254712345678';
  bool _processing = false;

  int get _cartSubtotal => _cart.fold<int>(0, (sum, item) => sum + ((item['price'] as int) * (item['qty'] as int)));
  int get _vatAmount => (_cartSubtotal * 0.16 / 1.16).round();

  void _addToCart(Map<String, dynamic> product) {
    final existingIdx = _cart.indexWhere((i) => i['id'] == product['id']);
    setState(() {
      if (existingIdx != -1) {
        _cart[existingIdx]['qty'] += 1;
      } else {
        _cart.add({...product, 'qty': 1});
      }
    });
  }

  void _removeFromCart(int index) {
    setState(() {
      _cart.removeAt(index);
    });
  }

  void _processCheckout() async {
    if (_cart.isEmpty || _processing) return;

    setState(() => _processing = true);

    try {
      final itemsSummary = _cart.map((i) => "${i['name']} (x${i['qty']})").join(', ');
      await widget.store.call('createSale', {
        'customer': _customerName,
        'items': itemsSummary,
        'total': _cartSubtotal,
        'paymentMethod': _selectedPaymentMethod,
        'phone': _mpesaPhone,
      });

      if (mounted) {
        setState(() {
          _cart.clear();
          _processing = false;
        });

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ Sale Processed! Receipt printed, stock deducted, eTIMS submitted & Journal posted.'),
            backgroundColor: Color(0xFF10B981),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _processing = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: ${e.toString()}'), backgroundColor: Colors.red),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.point_of_sale_rounded, color: Color(0xFF10B981)),
            SizedBox(width: 10),
            Text('Point of Sale (Retail Terminal)'),
          ],
        ),
      ),
      body: Row(
        children: [
          // Left Side: Catalog & Product Search
          Expanded(
            flex: 6,
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          decoration: InputDecoration(
                            prefixIcon: const Icon(Icons.qr_code_scanner_rounded, color: Color(0xFF10B981)),
                            hintText: 'Scan Barcode or Search Products (e.g. SOL-INV-5K)...',
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      ElevatedButton.icon(
                        onPressed: () {},
                        icon: const Icon(Icons.add_a_photo_rounded, size: 18),
                        label: const Text('Scan Camera'),
                        style: ElevatedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                          backgroundColor: const Color(0xFF10B981),
                          foregroundColor: Colors.white,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  const Text('SHARED INVENTORY PRODUCTS', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFF64748B))),
                  const SizedBox(height: 10),
                  Expanded(
                    child: StreamBuilder<List<Map<String, dynamic>>>(
                      stream: widget.store.watch('products'),
                      builder: (context, snapshot) {
                        if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
                        final products = snapshot.data!;
                        return GridView.builder(
                          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 3,
                            childAspectRatio: 1.1,
                            crossAxisSpacing: 12,
                            mainAxisSpacing: 12,
                          ),
                          itemCount: products.length,
                          itemBuilder: (context, idx) {
                            final p = products[idx];
                            final stock = p['stock'] as int;
                            final isLow = stock <= 5;
                            return Card(
                              elevation: 2,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                                side: BorderSide(color: isLow ? Colors.amber : const Color(0xFFE2E8F0)),
                              ),
                              child: InkWell(
                                onTap: () => _addToCart(p),
                                borderRadius: BorderRadius.circular(14),
                                child: Padding(
                                  padding: const EdgeInsets.all(12),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        children: [
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                            decoration: BoxDecoration(
                                              color: const Color(0xFFF1F5F9),
                                              borderRadius: BorderRadius.circular(6),
                                            ),
                                            child: Text(p['sku'] ?? 'SKU', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
                                          ),
                                          Chip(
                                            label: Text('$stock in stock', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
                                            backgroundColor: isLow ? Colors.amber.shade100 : const Color(0xFFD1FAE5),
                                            padding: EdgeInsets.zero,
                                          ),
                                        ],
                                      ),
                                      Text(p['name'], style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                                      Text(kes(p['price']), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Color(0xFF10B981))),
                                    ],
                                  ),
                                ),
                              ),
                            );
                          },
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Right Side: Cash Register Cart & Payment Terminal
          Container(
            width: 380,
            color: const Color(0xFFF8FAFC),
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.shopping_cart_rounded, color: Color(0xFF10B981)),
                    SizedBox(width: 10),
                    Text('Active Cart', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  ],
                ),
                const SizedBox(height: 12),
                StreamBuilder<List<Map<String, dynamic>>>(
                  stream: widget.store.watch('contacts'),
                  builder: (context, snapshot) {
                    final contacts = snapshot.data ?? [];
                    return DropdownButtonFormField<String>(
                      initialValue: _customerName,
                      decoration: const InputDecoration(labelText: 'Customer (CRM Linked)', isDense: true),
                      items: [
                        for (final c in contacts)
                          DropdownMenuItem(value: c['name'] as String, child: Text(c['name'] as String)),
                      ],
                      onChanged: (val) => setState(() => _customerName = val!),
                    );
                  },
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: _cart.isEmpty
                      ? const Center(child: Text('Cart is empty. Click items on the left.'))
                      : ListView.builder(
                          itemCount: _cart.length,
                          itemBuilder: (context, idx) {
                            final item = _cart[idx];
                            return Card(
                              margin: const EdgeInsets.only(bottom: 8),
                              child: ListTile(
                                dense: true,
                                title: Text(item['name'], style: const TextStyle(fontWeight: FontWeight.bold)),
                                subtitle: Text('${item['qty']} x ${kes(item['price'])}'),
                                trailing: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(kes(item['qty'] * item['price']), style: const TextStyle(fontWeight: FontWeight.bold)),
                                    IconButton(
                                      icon: const Icon(Icons.delete_outline_rounded, color: Colors.red, size: 18),
                                      onPressed: () => _removeFromCart(idx),
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                ),
                const Divider(),
                Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('16% VAT Included:'),
                        Text(kes(_vatAmount), style: const TextStyle(fontWeight: FontWeight.bold)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Total Amount:', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                        Text(kes(_cartSubtotal), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Color(0xFF10B981))),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'M-Pesa STK', label: Text('M-Pesa')),
                    ButtonSegment(value: 'Cash', label: Text('Cash')),
                    ButtonSegment(value: 'Paystack', label: Text('Card')),
                  ],
                  selected: {_selectedPaymentMethod},
                  onSelectionChanged: (val) => setState(() => _selectedPaymentMethod = val.first),
                ),
                if (_selectedPaymentMethod == 'M-Pesa STK') ...[
                  const SizedBox(height: 12),
                  TextField(
                    decoration: const InputDecoration(labelText: 'M-Pesa Phone (STK Push Trigger)', isDense: true),
                    onChanged: (val) => _mpesaPhone = val,
                    controller: TextEditingController(text: _mpesaPhone),
                  ),
                ],
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: _cart.isEmpty || _processing ? null : _processCheckout,
                    icon: _processing
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                        : const Icon(Icons.check_circle_rounded),
                    label: Text(_processing ? 'Processing M-Pesa & eTIMS...' : 'AUTHORIZE & PRINT RECEIPT'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF10B981),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      textStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
