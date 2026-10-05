import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../suite.dart';

class SmartIntakeScreen extends StatefulWidget {
  final SuiteStore store;
  const SmartIntakeScreen({super.key, required this.store});

  @override
  State<SmartIntakeScreen> createState() => _SmartIntakeScreenState();
}

class _SmartIntakeScreenState extends State<SmartIntakeScreen> {
  final text = TextEditingController();
  bool busy = false;
  String? error;
  Map<String, dynamic>? proposal;
  final selected = <int>{};

  @override
  void dispose() {
    text.dispose();
    super.dispose();
  }

  void toast(String message, {bool bad = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: bad ? Colors.red.shade700 : null,
      ),
    );
  }

  Future<void> run(Future<void> Function() action) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await action();
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString());
        toast('Smart Intake failed: ' + e.toString(), bad: true);
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void loadProposal(Map<String, dynamic> value) {
    final records = value['records'] as List? ?? const [];
    setState(() {
      proposal = value;
      selected
        ..clear()
        ..addAll(List<int>.generate(records.length, (index) => index));
    });
  }

  Future<void> analyzeText() async {
    final value = text.text.trim();
    if (value.isEmpty) {
      toast('Describe the business record you want to add.', bad: true);
      return;
    }
    await run(() async {
      final result = await widget.store.call(
        'analyzeBusinessIntakeText',
        {'text': value},
      );
      loadProposal(result);
    });
  }

  String? mimeFor(String name) {
    final lower = name.toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.txt')) return 'text/plain';
    if (lower.endsWith('.csv')) return 'text/csv';
    if (lower.endsWith('.json')) return 'application/json';
    return null;
  }

  Future<void> pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      withData: true,
      allowMultiple: false,
      type: FileType.custom,
      allowedExtensions: const [
        'jpg',
        'jpeg',
        'png',
        'webp',
        'pdf',
        'txt',
        'csv',
        'json',
      ],
    );
    if (result == null || result.files.isEmpty) return;
    final file = result.files.single;
    final bytes = file.bytes;
    final type = mimeFor(file.name);
    if (bytes == null || type == null) {
      toast('This file type is not supported by Smart Intake.', bad: true);
      return;
    }
    if (bytes.length > 12 * 1024 * 1024) {
      toast('Smart Intake files are limited to 12 MB.', bad: true);
      return;
    }

    await run(() async {
      final signed = await widget.store.call(
        'createBusinessIntakeUpload',
        {
          'name': file.name,
          'contentType': type,
          'size': bytes.length,
        },
      );
      final response = await http.put(
        Uri.parse(signed['uploadUrl'].toString()),
        headers: {'Content-Type': type},
        body: bytes,
      );
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw StateError(
          'Upload failed (' + response.statusCode.toString() + ').',
        );
      }
      final analyzed = await widget.store.call(
        'analyzeBusinessIntakeUpload',
        {'uploadId': signed['uploadId']},
      );
      loadProposal(analyzed);
    });
  }

  Future<void> openRecent() async {
    await run(() async {
      final result = await widget.store.call('getBusinessIntakeProposals');
      final rows = (result['proposals'] as List? ?? const [])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Recent Smart Intake proposals'),
          content: SizedBox(
            width: 700,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 520),
              child: rows.isEmpty
                  ? const Center(child: Text('No proposals yet.'))
                  : ListView.separated(
                      shrinkWrap: true,
                      itemCount: rows.length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (_, index) {
                        final row = rows[index];
                        final count =
                            (row['records'] as List? ?? const []).length;
                        return ListTile(
                          leading:
                              const Icon(Icons.auto_awesome_motion_rounded),
                          title: Text(
                            (row['summary'] ?? 'Smart Intake proposal')
                                .toString(),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          subtitle: Text(
                            (row['source'] ?? 'unknown').toString() +
                                ' · ' +
                                count.toString() +
                                ' records · ' +
                                (row['state'] ?? 'review').toString(),
                          ),
                          onTap: () {
                            Navigator.pop(dialogContext);
                            loadProposal(row);
                          },
                        );
                      },
                    ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Close'),
            ),
          ],
        ),
      );
    });
  }

  Future<String?> askName(String title, String initial) async {
    final controller = TextEditingController(text: initial);
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Name'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () =>
                Navigator.pop(dialogContext, controller.text.trim()),
            child: const Text('Continue'),
          ),
        ],
      ),
    );
    controller.dispose();
    return result;
  }

  Future<void> manageIoTKeys() async {
    await run(() async {
      final result = await widget.store.call('listBusinessIngestionKeys');
      final keys = (result['keys'] as List? ?? const [])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => StatefulBuilder(
          builder: (dialogContext, setDialogState) => AlertDialog(
            title: const Text('IoT / API ingestion keys'),
            content: SizedBox(
              width: 680,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 500),
                child: ListView(
                  shrinkWrap: true,
                  children: [
                    Align(
                      alignment: Alignment.centerLeft,
                      child: FilledButton.icon(
                        icon: const Icon(Icons.add_link_rounded),
                        label: const Text('Create ingestion key'),
                        onPressed: () async {
                          final name = await askName(
                            'Create ingestion key',
                            'IoT / API ingestion',
                          );
                          if (name == null || name.isEmpty) return;
                          try {
                            final created = await widget.store.call(
                              'createBusinessIngestionKey',
                              {'name': name},
                            );
                            if (!mounted) return;
                            await showDialog<void>(
                              context: context,
                              barrierDismissible: false,
                              builder: (ctx) => AlertDialog(
                                title: const Text('Copy this key now'),
                                content: SelectableText(
                                  'This token is shown only once. Store it in the IoT gateway or integration secret store.\n\n' +
                                      created['token'].toString(),
                                ),
                                actions: [
                                  FilledButton(
                                    onPressed: () => Navigator.pop(ctx),
                                    child: const Text('I saved it'),
                                  ),
                                ],
                              ),
                            );
                            setDialogState(() {
                              keys.insert(0, {
                                'id': created['keyId'],
                                'name': name,
                                'active': true,
                              });
                            });
                          } catch (e) {
                            toast(
                              'Could not create ingestion key: ' +
                                  e.toString(),
                              bad: true,
                            );
                          }
                        },
                      ),
                    ),
                    const SizedBox(height: 12),
                    if (keys.isEmpty)
                      const Padding(
                        padding: EdgeInsets.all(24),
                        child: Text('No IoT/API ingestion keys yet.'),
                      )
                    else
                      for (final key in keys)
                        ListTile(
                          leading: Icon(
                            key['active'] == true
                                ? Icons.sensors_rounded
                                : Icons.sensors_off_rounded,
                          ),
                          title: Text(
                            (key['name'] ?? key['id']).toString(),
                          ),
                          subtitle: Text((key['id'] ?? '').toString()),
                          trailing: key['active'] == true
                              ? IconButton(
                                  tooltip: 'Revoke key',
                                  icon: const Icon(Icons.link_off_rounded),
                                  onPressed: () async {
                                    try {
                                      await widget.store.call(
                                        'revokeBusinessIngestionKey',
                                        {'keyId': key['id']},
                                      );
                                      setDialogState(
                                        () => key['active'] = false,
                                      );
                                    } catch (e) {
                                      toast(
                                        'Could not revoke key: ' +
                                            e.toString(),
                                        bad: true,
                                      );
                                    }
                                  },
                                )
                              : const Chip(label: Text('Revoked')),
                        ),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('Close'),
              ),
            ],
          ),
        ),
      );
    });
  }

  Future<void> commitSelected() async {
    final current = proposal;
    if (current == null || selected.isEmpty) return;
    await run(() async {
      final indexes = selected.toList()..sort();
      await widget.store.call(
        'commitBusinessIntakeProposal',
        {
          'proposalId': current['id'],
          'indexes': indexes,
        },
      );
      toast(
        'Selected records committed. Sales and expenses remain reviewable drafts.',
      );
      final refreshed =
          await widget.store.call('getBusinessIntakeProposals');
      final rows = (refreshed['proposals'] as List? ?? const [])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
      final matches =
          rows.where((row) => row['id'] == current['id']).toList();
      if (matches.isNotEmpty) loadProposal(matches.first);
    });
  }

  @override
  Widget build(BuildContext context) {
    final current = proposal;
    final records = (current?['records'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    final committed = Set<int>.from(
      (current?['committedIndexes'] as List? ?? const [])
          .map((value) => (value as num).toInt()),
    );

    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FB),
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(
              Icons.document_scanner_rounded,
              color: Color(0xFF7C3AED),
            ),
            SizedBox(width: 10),
            Text('Smart Intake'),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Recent proposals',
            onPressed: busy ? null : openRecent,
            icon: const Icon(Icons.history_rounded),
          ),
          IconButton(
            tooltip: 'IoT / API ingestion',
            onPressed: busy ? null : manageIoTKeys,
            icon: const Icon(Icons.sensors_rounded),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(24, 24, 24, 100),
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF111827), Color(0xFF6D28D9)],
              ),
              borderRadius: BorderRadius.circular(24),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x22111827),
                  blurRadius: 30,
                  offset: Offset(0, 12),
                ),
              ],
            ),
            child: Wrap(
              spacing: 24,
              runSpacing: 18,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                const SizedBox(
                  width: 430,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Turn business evidence into structured records',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      SizedBox(height: 8),
                      Text(
                        'Use photos, receipts, PDFs, CSV/JSON/text, natural language or authenticated IoT/API feeds. AI proposes records first; you decide what gets committed.',
                        style: TextStyle(
                          color: Color(0xFFEDE9FE),
                          height: 1.45,
                        ),
                      ),
                    ],
                  ),
                ),
                FilledButton.icon(
                  onPressed: busy ? null : pickFile,
                  icon: const Icon(Icons.upload_file_rounded),
                  label: const Text('Photo / document'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Natural-language intake',
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 17,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Example: Add 24 bottles of mineral water at KES 65 each to Main Warehouse, SKU WATER-500.',
                    style: TextStyle(color: Color(0xFF64748B)),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: text,
                    minLines: 3,
                    maxLines: 8,
                    decoration: const InputDecoration(
                      hintText:
                          'Describe assets, stock, expenses, sales, support issues or another business record…',
                    ),
                  ),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: busy ? null : analyzeText,
                    icon: busy
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child:
                                CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.auto_awesome_rounded),
                    label: Text(
                      busy ? 'Analyzing…' : 'Analyze with AI',
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (error != null) ...[
            const SizedBox(height: 14),
            Card(
              child: ListTile(
                leading: const Icon(
                  Icons.error_outline_rounded,
                  color: Colors.red,
                ),
                title: const Text('Intake error'),
                subtitle: Text(error!),
              ),
            ),
          ],
          if (current != null) ...[
            const SizedBox(height: 20),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.fact_check_outlined,
                      color: Color(0xFF7C3AED),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment:
                            CrossAxisAlignment.start,
                        children: [
                          Text(
                            (current['summary'] ??
                                    'Review extracted records')
                                .toString(),
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 17,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            (current['source'] ?? 'source').toString() +
                                ' · ' +
                                records.length.toString() +
                                ' proposed records',
                            style: const TextStyle(
                              color: Color(0xFF64748B),
                            ),
                          ),
                        ],
                      ),
                    ),
                    FilledButton.icon(
                      onPressed:
                          busy || selected.isEmpty ? null : commitSelected,
                      icon: const Icon(
                        Icons.check_circle_outline_rounded,
                      ),
                      label: Text(
                        'Commit ' + selected.length.toString(),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            for (var index = 0;
                index < records.length;
                index++) ...[
              recordCard(
                records[index],
                index,
                committed.contains(index),
              ),
              const SizedBox(height: 10),
            ],
          ],
        ],
      ),
    );
  }

  Widget recordCard(
    Map<String, dynamic> record,
    int index,
    bool alreadyCommitted,
  ) {
    final confidence =
        ((record['confidence'] as num?)?.toDouble() ?? 0)
            .clamp(0.0, 1.0);
    final warnings = (record['warnings'] as List? ?? const [])
        .map((e) => e.toString())
        .toList();
    final evidence = (record['evidence'] as List? ?? const [])
        .map((e) => e.toString())
        .toList();
    final fields = Map<String, dynamic>.from(
      record['fields'] as Map? ?? const {},
    );

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: confidence < .7
              ? const Color(0xFFF59E0B)
              : const Color(0xFFE5E7EB),
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0D0F172A),
            blurRadius: 18,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: ExpansionTile(
        leading: alreadyCommitted
            ? const CircleAvatar(
                backgroundColor: Color(0xFFD1FAE5),
                child: Icon(
                  Icons.check_rounded,
                  color: Color(0xFF059669),
                ),
              )
            : Checkbox(
                value: selected.contains(index),
                onChanged: (value) => setState(() {
                  if (value == true) {
                    selected.add(index);
                  } else {
                    selected.remove(index);
                  }
                }),
              ),
        title: Text(
          (record['title'] ?? 'Proposed record').toString(),
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        subtitle: Wrap(
          spacing: 8,
          runSpacing: 6,
          children: [
            Chip(
              label: Text(
                (record['target'] ?? 'generic').toString(),
              ),
            ),
            Chip(
              label: Text((record['appId'] ?? '').toString()),
            ),
            Chip(
              label: Text(
                (confidence * 100).round().toString() +
                    '% confidence',
              ),
            ),
            if ((record['risk'] ?? '') != 'standard')
              Chip(
                avatar:
                    const Icon(Icons.shield_outlined, size: 16),
                label: Text((record['risk'] ?? '').toString()),
              ),
          ],
        ),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (warnings.isNotEmpty) ...[
                  for (final warning in warnings)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                      leading: const Icon(
                        Icons.warning_amber_rounded,
                        color: Color(0xFFF59E0B),
                      ),
                      title: Text(warning),
                    ),
                  const Divider(),
                ],
                const Text(
                  'Extracted fields',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 8),
                SelectableText(
                  const JsonEncoder.withIndent('  ').convert(fields),
                ),
                if (evidence.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  const Text(
                    'Evidence',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 6),
                  for (final item in evidence)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text('• ' + item),
                    ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
