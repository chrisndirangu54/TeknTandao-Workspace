import 'package:flutter/material.dart';
import 'suite.dart';

class RecordStream extends StatelessWidget {
  final SuiteStore store;
  final String path;
  final Widget Function(List<Map<String, dynamic>>) builder;
  const RecordStream({
    super.key,
    required this.store,
    required this.path,
    required this.builder,
  });
  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: store,
    builder: (context, _) => StreamBuilder<List<Map<String, dynamic>>>(
      stream: store.watch(path),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Text('Could not load records: ${snapshot.error}');
        }
        if (!snapshot.hasData) return const LinearProgressIndicator();
        return builder(snapshot.data!);
      },
    ),
  );
}

Future<List<String>?> recordForm(
  BuildContext context,
  String title,
  List<String> labels,
) async {
  final controllers = labels.map((_) => TextEditingController()).toList();
  final result = await showDialog<List<String>>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: SizedBox(
        width: 420,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 0; i < labels.length; i++)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: TextField(
                    controller: controllers[i],
                    decoration: InputDecoration(labelText: labels[i]),
                  ),
                ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(
            context,
            controllers.map((c) => c.text.trim()).toList(),
          ),
          child: const Text('Save'),
        ),
      ],
    ),
  );
  await Future<void>.delayed(const Duration(milliseconds: 250));
  for (final c in controllers) {
    c.dispose();
  }
  return result;
}

class ModuleScreen extends StatefulWidget {
  final SuiteStore store;
  final SuiteModule module;
  const ModuleScreen({super.key, required this.store, required this.module});
  @override
  State<ModuleScreen> createState() => _ModuleScreenState();
}

class _ModuleScreenState extends State<ModuleScreen> {
  bool busy = false;
  SuiteStore get store => widget.store;
  SuiteModule get m => widget.module;
  Future<void> run(Future<void> Function() action) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await action();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final path = switch (m.id) {
      'crm' => 'contacts',
      'inventory' => 'products',
      'pos' => 'sales',
      'accounting' => 'invoices',
      _ => 'modules/${m.id}/records',
    };
    return Scaffold(
      appBar: AppBar(title: Text(m.name)),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Text(
            m.description,
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 16),
          if (busy) const LinearProgressIndicator(),
          if (m.id != 'accounting')
            Align(
              alignment: Alignment.centerLeft,
              child: FilledButton.icon(
                onPressed: busy
                    ? null
                    : m.id == 'pos'
                    ? saleDialog
                    : addRecord,
                icon: const Icon(Icons.add),
                label: Text(m.id == 'pos' ? 'Record a sale' : 'Add record'),
              ),
            ),
          const SizedBox(height: 20),
          RecordStream(
            store: store,
            path: path,
            builder: (data) => recordList(data),
          ),
          if (m.id == 'crm') ...[
            const SizedBox(height: 24),
            const Text(
              'Automated follow-up tasks',
              style: TextStyle(fontSize: 22),
            ),
            RecordStream(store: store, path: 'tasks', builder: recordList),
          ],
        ],
      ),
    );
  }

  Widget recordList(List<Map<String, dynamic>> data) => Column(
    children: [
      if (data.isEmpty)
        const Padding(
          padding: EdgeInsets.all(32),
          child: Text('No records yet.'),
        ),
      for (final row in data)
        Card(
          child: ListTile(
            title: Text(row['name']?.toString() ?? 'Record ${row['id']}'),
            subtitle: Text(
              row.entries
                  .where(
                    (e) => ![
                      'id',
                      'name',
                      'updatedAt',
                      'createdAt',
                    ].contains(e.key),
                  )
                  .map(
                    (e) =>
                        '${e.key}: ${['price', 'total'].contains(e.key) && e.value is num ? kes(e.value) : e.value}',
                  )
                  .join(' · '),
            ),
          ),
        ),
    ],
  );
  Future<void> addRecord() async {
    final values = await recordForm(
      context,
      'Add to ${m.name}',
      m.id == 'inventory'
          ? ['Product name', 'Price in KES', 'Stock quantity']
          : ['Name', m.id == 'crm' ? 'Email (optional)' : 'Note (optional)'],
    );
    if (values == null || !mounted) return;
    await run(() async {
      if (values.first.isEmpty) throw Exception('Name is required');
      final record = <String, dynamic>{'name': values.first};
      if (m.id == 'inventory') {
        final price = double.tryParse(values[1]);
        final stock = int.tryParse(values[2]);
        if (price == null ||
            !price.isFinite ||
            price < 0 ||
            stock == null ||
            stock < 0) {
          throw Exception('Enter a valid price and stock quantity');
        }
        record.addAll({'price': (price * 100).round(), 'stock': stock});
      } else {
        record[m.id == 'crm' ? 'email' : 'note'] = values[1];
      }
      await store.call('saveRecord', {'appId': m.id, 'record': record});
    });
  }

  Future<void> saleDialog() async {
    String? productId, contactId;
    var quantity = 1;
    final requestId = 'sale_${DateTime.now().microsecondsSinceEpoch}';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: const Text('Record a sale'),
          content: SizedBox(
            width: 500,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Uses shared CRM customers and inventory. The sale is recorded as unpaid.',
                ),
                const SizedBox(height: 20),
                RecordStream(
                  store: store,
                  path: 'contacts',
                  builder: (data) => DropdownButtonFormField<String>(
                    initialValue: contactId,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Customer'),
                    items: [
                      for (final d in data)
                        DropdownMenuItem(
                          value: d['id'] as String,
                          child: Text(d['name']),
                        ),
                    ],
                    onChanged: (v) => update(() => contactId = v),
                  ),
                ),
                const SizedBox(height: 16),
                RecordStream(
                  store: store,
                  path: 'products',
                  builder: (data) => DropdownButtonFormField<String>(
                    initialValue: productId,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Product'),
                    items: [
                      for (final d in data)
                        DropdownMenuItem(
                          value: d['id'] as String,
                          child: Text(
                            '${d['name']} · ${kes(d['price'])} · ${d['stock']} left',
                          ),
                        ),
                    ],
                    onChanged: (v) => update(() => productId = v),
                  ),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  initialValue: '1',
                  decoration: const InputDecoration(labelText: 'Quantity'),
                  keyboardType: TextInputType.number,
                  onChanged: (v) =>
                      update(() => quantity = int.tryParse(v) ?? 0),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: productId == null || contactId == null || quantity < 1
                  ? null
                  : () => Navigator.pop(context, true),
              child: const Text('Record sale'),
            ),
          ],
        ),
      ),
    );
    if (confirmed != true || !mounted) return;
    await run(() async {
      await store.call('createSale', {
        'productId': productId,
        'contactId': contactId,
        'quantity': quantity,
        'requestId': requestId,
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Sale recorded. Connected workflows will process automatically.',
            ),
          ),
        );
      }
    });
  }
}
