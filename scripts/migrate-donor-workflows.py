"""Install Firebase operational routes in retained UI donors, with no sample data."""
from pathlib import Path
import json
ROOT = Path(__file__).resolve().parents[1]
crm = ROOT / 'sources/FlareLine-CRM/lib/pages'
specs = [
 ('deals/deals_page.dart', 'DealsPage', 'Deals', 'deal', "{'name': 'Deal name', 'contactId': 'Contact ID', 'valueMinor': 'Value in minor currency units', 'stage': 'Stage: lead, qualified, proposal, won, lost'}", False),
 ('task/task_page.dart', 'TasksPage', 'Tasks', 'task', "{'name': 'Task', 'dueAt': 'Due time (ISO date with timezone)', 'status': 'Status: open, in_progress, completed, cancelled', 'notes': 'Notes'}", False),
 ('report/report_page.dart', 'ReportPage', 'Pipeline report', 'deal', "{'name': 'Deal', 'contactId': 'Contact ID', 'valueMinor': 'Value in minor units', 'stage': 'Stage'}", True),
]
for day in ['Day', 'Week', 'Month']:
 specs.append((f'calendar/{day.lower()}_calendar_page.dart', f'{day}CalendarPage', 'Calendar events', 'calendar', "{'name': 'Event', 'startAt': 'Start (ISO date with timezone)', 'endAt': 'End (ISO date with timezone)', 'notes': 'Notes'}", False))
for file, cls, title, kind, fields, readonly in specs:
 (crm / file).write_text(f"""import 'package:flutter/material.dart';
import 'package:donor_firebase/donor_firebase.dart';
import 'package:flareline_crm/pages/crm_layout.dart';

class {cls} extends CrmLayout {{
  const {cls}({{super.key}});
  @override
  String breakTabTitle(BuildContext context) => '{title}';
  @override
  Widget contentDesktopWidget(BuildContext context) => const FirebaseDonorPanel(
    title: '{title}', appId: 'crm', collection: 'modules/crm/records', recordKind: '{kind}',
    fields: {fields}, readOnly: {str(readonly).lower()},
  );
}}
""", encoding='utf-8')
hr = ROOT / 'sources/flutter_hr_management_design/lib/pages/dashboard/widget/recruitment_data_widget.dart'
hr.write_text("""import 'package:flutter/material.dart';
import 'package:donor_firebase/donor_firebase.dart';

class RecruitmentDataWidget extends StatelessWidget {
  const RecruitmentDataWidget({super.key});
  @override
  Widget build(BuildContext context) => const Column(children: [
    Padding(padding: EdgeInsets.all(20), child: FirebaseDonorPanel(
      title: 'Employees', appId: 'hr', collection: 'employees',
      fields: {'name': 'Name', 'email': 'Email', 'department': 'Department', 'position': 'Position'},
    )),
    ExpansionTile(title: Text('Recruitment'), children: [Padding(padding: EdgeInsets.all(20), child: FirebaseDonorPanel(
      title: 'Applications', appId: 'hr', collection: 'modules/hr/records', recordKind: 'application',
      fields: {'name': 'Applicant', 'email': 'Email', 'position': 'Position', 'stage': 'Stage: applied, screening, interview, offered, hired, rejected', 'notes': 'Notes'},
    ))]),
    ExpansionTile(title: Text('Leave requests'), children: [Padding(padding: EdgeInsets.all(20), child: FirebaseDonorPanel(
      title: 'Leave requests', appId: 'hr', collection: 'modules/hr/records', recordKind: 'leave',
      fields: {'name': 'Request', 'employeeId': 'Employee ID', 'startAt': 'Start (ISO date with timezone)', 'endAt': 'End (ISO date with timezone)', 'status': 'Status: requested, approved, rejected, cancelled', 'notes': 'Notes'},
    ))]),
    ExpansionTile(title: Text('Payroll runs'), children: [Padding(padding: EdgeInsets.all(20), child: FirebaseDonorPanel(
      title: 'Payroll runs', appId: 'hr', collection: 'modules/hr/records', recordKind: 'payRun',
      fields: {'name': 'Run name', 'employeeId': 'Employee ID', 'period': 'Period (YYYY-MM)', 'grossMinor': 'Gross pay in minor units', 'status': 'Status: draft, approved, paid, void', 'notes': 'Notes. Gross only; this does not calculate PAYE, NSSF, SHA, or housing levy'},
    ))]),
  ]);
}
""", encoding='utf-8')
p = ROOT / 'firestore.indexes.json'
config = json.loads(p.read_text())
index = {'collectionGroup': 'records', 'queryScope': 'COLLECTION', 'fields': [{'fieldPath': 'kind', 'order': 'ASCENDING'}, {'fieldPath': 'updatedAt', 'order': 'DESCENDING'}]}
if index not in config['indexes']: config['indexes'].append(index)
p.write_text(json.dumps(config, indent=2) + '\n')
print('CRM and HR workflow routes now use shared Firebase records.')
