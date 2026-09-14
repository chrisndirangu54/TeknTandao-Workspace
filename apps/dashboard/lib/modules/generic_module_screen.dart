import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../app_blueprints.dart';
import '../suite.dart';

class GenericEnterpriseModuleScreen extends StatefulWidget {
  final SuiteModule module;
  final SuiteStore store;

  const GenericEnterpriseModuleScreen({
    super.key,
    required this.module,
    required this.store,
  });

  @override
  State<GenericEnterpriseModuleScreen> createState() =>
      _GenericEnterpriseModuleScreenState();
}

class _GenericEnterpriseModuleScreenState
    extends State<GenericEnterpriseModuleScreen> {
  String _query = '';

  SuiteModule get module => widget.module;
  SuiteStore get store => widget.store;
  AppBlueprint get blueprint => blueprintFor(module);

  /// Production generic apps use their entitlement-bound top-level collection,
  /// matching Functions saveRecord and the generic Firestore read rule. Demo
  /// data remains under the in-memory modules/{app}/records namespace.
  String get _path => store.demo ? 'modules/${module.id}/records' : module.id;

  Future<void> _saveRecord(Map<String, dynamic> record, {String? id}) async {
    if (store is DemoSuiteStore && id != null) {
      final demo = store as DemoSuiteStore;
      final rows = demo.records[_path] ??= <Map<String, dynamic>>[];
      final index = rows.indexWhere((row) => row['id'] == id);
      if (index >= 0) {
        rows[index] = {...rows[index], ...record, 'id': id};
        demo.notifyListeners();
        return;
      }
    }
    await store.call('saveRecord', {
      'appId': module.id,
      if (id != null) 'id': id,
      'record': record,
    });
  }

  Future<void> _openEditor([Map<String, dynamic>? existing]) async {
    final titleController = TextEditingController(
      text: (existing?['title'] ?? existing?['name'] ?? '').toString(),
    );
    final controllers = <String, TextEditingController>{
      for (final field in blueprint.fields)
        field.key: TextEditingController(
          text: existing?[field.key]?.toString() ?? '',
        ),
    };
    var status = existing?['status']?.toString() ?? blueprint.statuses.first;

    final record = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(
            existing == null
                ? 'Add ${module.name} ${blueprint.entityLabel}'
                : 'Edit ${module.name} ${blueprint.entityLabel}',
          ),
          content: SizedBox(
            width: 620,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: titleController,
                    autofocus: true,
                    decoration: InputDecoration(
                      labelText: '${blueprint.entityLabel} title *',
                      border: const OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  for (final field in blueprint.fields) ...[
                    TextField(
                      controller: controllers[field.key],
                      minLines: field.multiline ? 3 : 1,
                      maxLines: field.multiline ? 6 : 1,
                      keyboardType: field.numeric
                          ? TextInputType.number
                          : TextInputType.text,
                      inputFormatters: field.numeric
                          ? [
                              FilteringTextInputFormatter.allow(
                                RegExp(r'[0-9.,-]'),
                              ),
                            ]
                          : null,
                      decoration: InputDecoration(
                        labelText: field.label,
                        hintText: field.hint.isEmpty ? null : field.hint,
                        border: const OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  DropdownButtonFormField<String>(
                    initialValue: blueprint.statuses.contains(status)
                        ? status
                        : blueprint.statuses.first,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Workflow status',
                      border: OutlineInputBorder(),
                    ),
                    items: [
                      for (final value in blueprint.statuses)
                        DropdownMenuItem(value: value, child: Text(value)),
                    ],
                    onChanged: (value) {
                      if (value != null) {
                        setDialogState(() => status = value);
                      }
                    },
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
              onPressed: () {
                final title = titleController.text.trim();
                if (title.isEmpty) return;
                Navigator.pop(context, {
                  'title': title,
                  for (final field in blueprint.fields)
                    field.key: controllers[field.key]!.text.trim(),
                  'status': status,
                });
              },
              child: Text(existing == null ? 'Create' : 'Save'),
            ),
          ],
        ),
      ),
    );

    titleController.dispose();
    for (final controller in controllers.values) {
      controller.dispose();
    }
    if (record == null) return;

    await _saveRecord(
      record,
      id: existing?['id']?.toString(),
    );
  }

  Future<void> _advance(Map<String, dynamic> item) async {
    final current = item['status']?.toString() ?? blueprint.statuses.first;
    final currentIndex = blueprint.statuses.indexOf(current);
    final nextIndex = currentIndex < 0
        ? 0
        : currentIndex + 1 >= blueprint.statuses.length
            ? blueprint.statuses.length - 1
            : currentIndex + 1;
    await _saveRecord(
      {
        'title': (item['title'] ?? item['name'] ?? blueprint.entityLabel)
            .toString(),
        'status': blueprint.statuses[nextIndex],
      },
      id: item['id']?.toString(),
    );
  }

  Future<void> _archive(Map<String, dynamic> item) async {
    await _saveRecord(
      {
        'title': (item['title'] ?? item['name'] ?? blueprint.entityLabel)
            .toString(),
        'status': blueprint.statuses.contains('ARCHIVED')
            ? 'ARCHIVED'
            : blueprint.statuses.last,
      },
      id: item['id']?.toString(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Icon(module.icon, color: module.color),
            const SizedBox(width: 10),
            Expanded(
              child: Text(module.name, overflow: TextOverflow.ellipsis),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openEditor(),
        icon: const Icon(Icons.add_rounded),
        label: Text('New ${blueprint.entityLabel}'),
      ),
      body: AnimatedBuilder(
        animation: store,
        builder: (context, _) => StreamBuilder<List<Map<String, dynamic>>>(
          stream: store.watch(_path),
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting &&
                !snapshot.hasData) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    'Unable to load ${module.name} records: ${snapshot.error}',
                    textAlign: TextAlign.center,
                  ),
                ),
              );
            }

            final allRecords =
                snapshot.data ?? const <Map<String, dynamic>>[];
            final query = _query.trim().toLowerCase();
            final visible = query.isEmpty
                ? allRecords
                : allRecords.where((item) {
                    return item.values.any(
                      (value) =>
                          value.toString().toLowerCase().contains(query),
                    );
                  }).toList(growable: false);
            final completed = allRecords.where((item) {
              final status = item['status']?.toString();
              return status == blueprint.statuses.last ||
                  status == 'DONE' ||
                  status == 'COMPLETED' ||
                  status == 'CLOSED';
            }).length;

            return SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 24, 24, 96),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildHeader(allRecords.length, completed),
                  const SizedBox(height: 20),
                  TextField(
                    decoration: InputDecoration(
                      prefixIcon: const Icon(Icons.search_rounded),
                      hintText: 'Search ${module.name} records...',
                      border: const OutlineInputBorder(),
                    ),
                    onChanged: (value) => setState(() => _query = value),
                  ),
                  const SizedBox(height: 16),
                  if (visible.isEmpty)
                    _emptyState(allRecords.isEmpty)
                  else
                    Card(
                      clipBehavior: Clip.antiAlias,
                      child: ListView.separated(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        itemCount: visible.length,
                        separatorBuilder: (_, _) => const Divider(height: 1),
                        itemBuilder: (context, index) =>
                            _recordTile(visible[index]),
                      ),
                    ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildHeader(int total, int completed) {
    final open = total - completed;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          module.description,
          style: const TextStyle(color: Color(0xFF64748B), height: 1.45),
        ),
        const SizedBox(height: 18),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            _statCard('Total records', '$total', Icons.dataset_rounded),
            _statCard('Open / active', '$open', Icons.pending_actions_rounded),
            _statCard('Completed', '$completed', Icons.task_alt_rounded),
            _statCard(
              'Monthly plan',
              '${kes(module.monthlyPriceKes)}/mo',
              Icons.sell_rounded,
            ),
          ],
        ),
      ],
    );
  }

  Widget _emptyState(bool noRecords) => Card(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Row(
            children: [
              Icon(
                noRecords ? Icons.inbox_outlined : Icons.search_off_rounded,
                color: module.color,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  noRecords
                      ? 'No ${module.name} records yet. Create the first ${blueprint.entityLabel.toLowerCase()}.'
                      : 'No records match your search.',
                ),
              ),
            ],
          ),
        ),
      );

  Widget _recordTile(Map<String, dynamic> item) {
    final title =
        (item['title'] ?? item['name'] ?? blueprint.entityLabel).toString();
    final status = item['status']?.toString() ?? blueprint.statuses.first;
    final detail = blueprint.fields
        .where(
          (field) => item[field.key]?.toString().trim().isNotEmpty == true,
        )
        .take(3)
        .map((field) => '${field.label}: ${item[field.key]}')
        .join(' · ');
    final statusIndex = blueprint.statuses.indexOf(status);
    final canAdvance =
        statusIndex >= 0 && statusIndex < blueprint.statuses.length - 1;

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
      leading: CircleAvatar(
        backgroundColor: module.color.withValues(alpha: 0.1),
        child: Icon(module.icon, color: module.color),
      ),
      title: Text(
        title,
        style: const TextStyle(fontWeight: FontWeight.bold),
      ),
      subtitle: detail.isEmpty ? Text(status) : Text('$status · $detail'),
      trailing: PopupMenuButton<String>(
        onSelected: (action) {
          if (action == 'edit') _openEditor(item);
          if (action == 'advance') _advance(item);
          if (action == 'archive') _archive(item);
        },
        itemBuilder: (context) => [
          const PopupMenuItem(value: 'edit', child: Text('Edit')),
          if (canAdvance)
            PopupMenuItem(
              value: 'advance',
              child: Text(
                'Advance to ${blueprint.statuses[statusIndex + 1]}',
              ),
            ),
          const PopupMenuItem(
            value: 'archive',
            child: Text('Close / archive'),
          ),
        ],
      ),
      onTap: () => _openEditor(item),
    );
  }

  Widget _statCard(String label, String value, IconData icon) => Container(
        width: 210,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: Row(
          children: [
            Icon(icon, color: module.color),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                      fontSize: 11,
                      color: Color(0xFF64748B),
                    ),
                  ),
                  Text(
                    value,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}
