import 'package:flutter/material.dart';
import '../suite.dart';
import '../module_screen.dart' show RecordStream;
import '../widgets/record_form.dart';

class ConnectedRecordType {
  final String kind;
  final String title;
  final Map<String, String> fields;
  const ConnectedRecordType(this.kind, this.title, this.fields);
}

const hospitalRecordTypes = [
  ConnectedRecordType('appointment', 'Appointments', {
    'name': 'Appointment title', 'patientId': 'Patient ID', 'doctor': 'Doctor',
    'scheduledAt': 'Time with timezone (2026-09-22T10:00:00+03:00)', 'notes': 'Notes (optional)',
  }),
  ConnectedRecordType('prescription', 'Prescriptions', {
    'name': 'Prescription title', 'patientId': 'Patient ID', 'medicine': 'Medicine', 'instructions': 'Instructions',
  }),
  ConnectedRecordType('labTest', 'Lab tests', {
    'name': 'Test name', 'patientId': 'Patient ID',
    'scheduledAt': 'Time with timezone (2026-09-22T10:00:00+03:00)', 'notes': 'Notes (optional)',
  }),
  ConnectedRecordType('clinicalNote', 'Clinical notes', {
    'name': 'Note title', 'patientId': 'Patient ID', 'notes': 'Clinical note', 'patientVisible': 'Share with patient: true or false (default false)',
  }),
];

const schoolRecordTypes = [
  ConnectedRecordType('lesson', 'Lessons', {
    'name': 'Lesson title', 'subject': 'Subject', 'className': 'Class', 'notes': 'Lesson notes (optional)',
  }),
  ConnectedRecordType('assignment', 'Assignments', {
    'name': 'Assignment title', 'subject': 'Subject', 'className': 'Class',
    'dueAt': 'Due time with timezone (2026-09-22T10:00:00+03:00)', 'notes': 'Instructions (optional)',
  }),
  ConnectedRecordType('announcement', 'Announcements', {
    'name': 'Announcement title', 'className': 'Class', 'notes': 'Message',
  }),
  ConnectedRecordType('grade', 'Grades', {
    'name': 'Assessment name', 'studentId': 'Student ID', 'subject': 'Subject', 'result': 'Result (e.g. 82/100)',
  }),
];

/// All tabs use the same tenant-scoped store as the rest of the workspace.
class ConnectedRecords extends StatefulWidget {
  final SuiteStore store;
  final String appId;
  final List<ConnectedRecordType> types;
  const ConnectedRecords({super.key, required this.store, required this.appId, required this.types});
  @override
  State<ConnectedRecords> createState() => _ConnectedRecordsState();
}

class _ConnectedRecordsState extends State<ConnectedRecords> {
  bool busy = false;
  Future<void> add(ConnectedRecordType type) async {
    final values = await recordForm(context, 'New ${type.title.toLowerCase()}', type.fields.values.toList());
    if (values == null || !mounted) return;
    setState(() => busy = true);
    try {
      final keys = type.fields.keys.toList();
      await widget.store.call('saveModuleRecord', {
        'appId': widget.appId, 'kind': type.kind,
        'record': {for (var i = 0; i < keys.length; i++) keys[i]: values[i]},
      });
      if (mounted) setState(() {});
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not save: $error')));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => RecordStream(
    store: widget.store,
    path: 'modules/${widget.appId}/records',
    builder: (records) => ListView(
      padding: const EdgeInsets.all(16),
      children: [
        for (final type in widget.types)
          Card(child: ExpansionTile(
            title: Text(type.title),
            children: [
              Padding(padding: const EdgeInsets.all(12), child: Align(
                alignment: Alignment.centerLeft,
                child: FilledButton.icon(onPressed: busy ? null : () => add(type),
                  icon: const Icon(Icons.add), label: Text('Add ${type.title.toLowerCase()}')),
              )),
              if (!records.any((record) => record['kind'] == type.kind))
                const ListTile(title: Text('No records yet')),
              for (final record in records.where((record) => record['kind'] == type.kind))
                ListTile(
                  title: Text('${record['name'] ?? ''}'),
                  subtitle: Text(type.fields.entries.where((field) => field.key != 'name')
                    .map((field) => '${field.value}: ${record[field.key] ?? ''}').join('\n')),
                  isThreeLine: true,
                ),
            ],
          )),
      ],
    ),
  );
}
