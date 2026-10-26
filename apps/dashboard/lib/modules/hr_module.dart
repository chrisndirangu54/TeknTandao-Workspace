import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';
import 'talent_marketplace.dart';

class HrModuleScreen extends StatefulWidget {
  final SuiteStore store;

  const HrModuleScreen({super.key, required this.store});

  @override
  State<HrModuleScreen> createState() => _HrModuleScreenState();
}

class _HrModuleScreenState extends State<HrModuleScreen> {
  String? selectedId;

  @override
  void initState() {
    super.initState();
    widget.store.addListener(_onStore);
  }

  @override
  void didUpdateWidget(HrModuleScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.store != widget.store) {
      oldWidget.store.removeListener(_onStore);
      widget.store.addListener(_onStore);
    }
  }

  @override
  void dispose() {
    widget.store.removeListener(_onStore);
    super.dispose();
  }

  void _onStore() {
    if (mounted) setState(() {});
  }

  Future<void> runPayroll() async {
    final employeeId = selectedId;
    if (employeeId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Select an employee, then run payroll.')));
      return;
    }
    final details = await recordForm(context, 'Statutory payroll', ['Period YYYY-MM', 'Gross pay in shillings']);
    if (details == null || !mounted) return;
    final shillings = int.tryParse(details[1].trim());
    if (shillings == null || shillings <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter gross pay in whole shillings.')));
      return;
    }
    try {
      final result = await widget.store.call('runStatutoryPayroll', {
        'employeeId': employeeId,
        'period': details[0].trim(),
        'grossMinor': shillings * 100,
      });
      if (!mounted) return;
      final net = result['netMinor'];
      final already = result['alreadyPosted'] == true;
      final message = net is num
          ? '${already ? 'Payslip already posted' : 'Payslip posted'}. Net ${kes(net)}. PAYE ${kes((result['payeMinor'] as num?) ?? 0)}. NSSF ${kes((result['nssfEmployeeMinor'] as num?) ?? 0)}. SHIF ${kes((result['shifMinor'] as num?) ?? 0)}. Housing ${kes((result['housingEmployeeMinor'] as num?) ?? 0)}. Rate card ${result['rateCard']}.'
          : 'Payroll request sent.';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$error')));
    }
  }

  Future<void> _requestLeave() async {
    final id = selectedId;
    if (id == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select your linked employee record first.')));
      return;
    }
    final values = await recordForm(context, 'Request time off',
      ['Start date YYYY-MM-DD', 'End date YYYY-MM-DD', 'Leave type (annual/sick/parental/unpaid/other)', 'Reason']);
    if (values == null || !mounted) return;
    try {
      final result = await widget.store.call('requestHrLeave', {
        'employeeId': id,
        'startDate': values[0].trim(),
        'endDate': values[1].trim(),
        'leaveType': values[2].trim().toLowerCase(),
        'reason': values[3].trim(),
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Leave request ${result['requestId']} submitted for review.')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Leave request failed: $e')));
    }
  }

  Future<void> _showLeaveBalance() async {
    if (selectedId == null) return;
    final year = DateTime.now().year.toString();
    try {
      final result = await widget.store.call('getHrAnnualLeaveBalance', {
        'employeeId': selectedId, 'year': year,
      });
      if (!mounted) return;
      await showDialog<void>(context: context, builder: (dialogContext) => AlertDialog(
        title: Text('Annual leave · $year'),
        content: Text(result['configured'] == true
          ? 'Granted: ${result['grantedDays']} days\nUsed: ${result['usedDays']} days\nRemaining: ${result['remainingDays']} days'
          : 'Your employer has not configured an annual leave entitlement for this year.'),
        actions: [TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Close'))],
      ));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Balance unavailable: $e')));
    }
  }

  Future<void> _showLeaveHistory() async {
    if (selectedId == null) return;
    try {
      final result = await widget.store.call('listHrLeaveRequests', {'employeeId': selectedId});
      if (!mounted) return;
      final requests = (result['requests'] as List?) ?? [];
      await showDialog<void>(context: context, builder: (dialogContext) => AlertDialog(
        title: const Text('Leave request history'),
        content: SizedBox(width: 450, child: requests.isEmpty
          ? const Text('No leave requests recorded.')
          : ListView.builder(shrinkWrap: true, itemCount: requests.length,
              itemBuilder: (context, i) {
                final entry = requests[i] as Map;
                return ListTile(
                  title: Text('${entry['leaveType']} · ${entry['status']}'),
                  subtitle: Text('${entry['startDate']} – ${entry['endDate']}'),
                );
              })),
        actions: [TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Close'))],
      ));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Leave history unavailable: $e')));
    }
  }

  Future<void> _approvalInbox() async {
    try {
      final data = await widget.store.call('listHrLeaveApprovalInbox', {});
      if (!mounted) return;
      final requests = (data['requests'] as List?) ?? [];
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Leave approval inbox · Manager / HR'),
          content: SizedBox(
            width: 650,
            height: 430,
            child: requests.isEmpty
              ? const Center(child: Text('No leave requests currently assigned to you.'))
              : ListView.builder(
                  itemCount: requests.length,
                  itemBuilder: (context, index) {
                    final item = requests[index] as Map;
                    return ListTile(
                      title: Text('${item['employeeName']} · ${item['leaveType']}'),
                      subtitle: Text('${item['department']} · ${item['startDate']} – ${item['endDate']} · ${item['status']}'),
                      trailing: Wrap(mainAxisSize: MainAxisSize.min, spacing: 6, children: [
                        TextButton(
                          onPressed: () async {
                            try {
                              await widget.store.call('decideHrLeave', {
                                'requestId': item['id'], 'status': 'approved',
                              });
                              if (dialogContext.mounted) Navigator.pop(dialogContext);
                              if (mounted) ScaffoldMessenger.of(this.context).showSnackBar(
                                const SnackBar(content: Text('Decision saved. Manager approvals await final HR review; leave is deducted only after final approval.')));
                            } catch (error) {
                              if (dialogContext.mounted) ScaffoldMessenger.of(dialogContext).showSnackBar(
                                SnackBar(content: Text('Approval failed: $error')));
                            }
                          }, child: const Text('Approve'),
                        ),
                        TextButton(
                          onPressed: () async {
                            final details = await recordForm(dialogContext, 'Reject leave request', ['Reason']);
                            if (details == null || details[0].trim().isEmpty) return;
                            try {
                              await widget.store.call('decideHrLeave', {
                                'requestId': item['id'], 'status': 'rejected', 'reason': details[0].trim(),
                              });
                              if (dialogContext.mounted) Navigator.pop(dialogContext);
                              if (mounted) ScaffoldMessenger.of(this.context).showSnackBar(
                                const SnackBar(content: Text('Leave rejected with reason recorded.')));
                            } catch (error) {
                              if (dialogContext.mounted) ScaffoldMessenger.of(dialogContext).showSnackBar(
                                SnackBar(content: Text('Rejection failed: $error')));
                            }
                          }, child: const Text('Reject'),
                        ),
                      ]),
                    );
                  },
                ),
          ),
          actions: [TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Close'))],
        ),
      );
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Approval inbox unavailable: $error')));
    }
  }

  Future<void> _reviewGrowth(Map review) async {
    final reviewId = review['id'];
    final isManager = review['myRole'] == 'manager';
    try {
      final data = await widget.store.call('listHrReviewGrowth', {'reviewId': reviewId});
      if (!mounted) return;
      final feedback = (data['feedback'] as List?) ?? [];
      final plans = (data['plans'] as List?) ?? [];
      await showDialog<void>(context: context, builder: (dialogContext) => AlertDialog(
        title: const Text('Feedback & development'),
        content: SizedBox(width: 560, height: 430, child: ListView(children: [
          const Text('CONTINUOUS FEEDBACK', style: TextStyle(fontWeight: FontWeight.bold)),
          if (feedback.isEmpty) const Text('No feedback recorded yet.'),
          for (final entry in feedback)
            ListTile(title: Text((entry as Map)['category'].toString()),
              subtitle: Text(entry['message'].toString())),
          const Divider(),
          const Text('DEVELOPMENT PLANS', style: TextStyle(fontWeight: FontWeight.bold)),
          if (plans.isEmpty) const Text('No development plans created yet.'),
          for (final plan in plans)
            ListTile(title: Text((plan as Map)['title'].toString()),
              subtitle: Text('${plan['description']} · Due ${plan['dueDate']} · ${plan['status']}'),
              trailing: isManager ? PopupMenuButton<String>(
                tooltip: 'Update development progress',
                onSelected: (status) async {
                  try {
                    await widget.store.call('advanceHrDevelopmentPlan', {
                      'reviewId': reviewId, 'planId': plan['id'], 'status': status,
                    });
                    if (dialogContext.mounted) Navigator.pop(dialogContext);
                    if (mounted) ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Development plan updated. Reopen to refresh.')));
                  } catch (error) {
                    if (dialogContext.mounted) ScaffoldMessenger.of(dialogContext).showSnackBar(
                      SnackBar(content: Text('Update failed: $error')));
                  }
                },
                itemBuilder: (_) => ['in_progress', 'blocked', 'completed', 'cancelled']
                  .map((status) => PopupMenuItem(value: status, child: Text(status))).toList(),
              ) : null),
        ])),
        actions: [
          TextButton(onPressed: () async {
            final values = await recordForm(dialogContext, 'Continuous feedback',
              ['Category (recognition/coaching/check_in)', 'Feedback']);
            if (values == null) return;
            try {
              await widget.store.call('addHrContinuousFeedback', {
                'reviewId': reviewId, 'category': values[0].trim().toLowerCase(),
                'message': values[1].trim(),
              });
              if (dialogContext.mounted) Navigator.pop(dialogContext);
              if (mounted) ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Feedback saved. Reopen to refresh.')));
            } catch (error) {
              if (dialogContext.mounted) ScaffoldMessenger.of(dialogContext).showSnackBar(
                SnackBar(content: Text('Feedback failed: $error')));
            }
          }, child: const Text('Add feedback')),
          if (isManager) TextButton(onPressed: () async {
            final values = await recordForm(dialogContext, 'New development plan',
              ['Title', 'Description', 'Due date YYYY-MM-DD']);
            if (values == null) return;
            try {
              await widget.store.call('createHrDevelopmentPlan', {
                'reviewId': reviewId, 'title': values[0].trim(),
                'description': values[1].trim(), 'dueDate': values[2].trim(),
              });
              if (dialogContext.mounted) Navigator.pop(dialogContext);
              if (mounted) ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Development plan created. Reopen to refresh.')));
            } catch (error) {
              if (dialogContext.mounted) ScaffoldMessenger.of(dialogContext).showSnackBar(
                SnackBar(content: Text('Plan creation failed: $error')));
            }
          }, child: const Text('Add plan')),
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Close')),
        ],
      ));
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Growth records unavailable: $error')));
    }
  }

  Future<void> _performanceReviews() async {
    try {
      final result = await widget.store.call('listMyHrPerformanceReviews', {});
      if (!mounted) return;
      final reviews = (result['reviews'] as List?) ?? [];
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('My performance reviews'),
          content: SizedBox(width: 620, height: 450,
            child: reviews.isEmpty
              ? const Center(child: Text('No reviews assigned to your account.'))
              : ListView.builder(itemCount: reviews.length, itemBuilder: (context, index) {
                  final review = reviews[index] as Map;
                  final goals = (review['goals'] as List?) ?? [];
                  final role = review['myRole']?.toString() ?? '';
                  final status = review['status']?.toString() ?? '';
                  final canSubmit = (role == 'employee' && status == 'self_assessment') ||
                    (role == 'manager' && status == 'manager_review');
                  return Card(child: Padding(padding: const EdgeInsets.all(12),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Review: ${review['startDate']} – ${review['endDate']}',
                        style: const TextStyle(fontWeight: FontWeight.bold)),
                      Text('Role: $role · Status: $status'),
                      for (final goal in goals)
                        Text('• ${(goal as Map)['title']} (${goal['weight']}%)'),
                      Align(alignment: Alignment.centerRight,
                        child: TextButton.icon(
                          onPressed: () => _reviewGrowth(review),
                          icon: const Icon(Icons.trending_up_outlined),
                          label: const Text('Feedback & development'),
                        ),
                      ),
                      if (canSubmit) Align(alignment: Alignment.centerRight,
                        child: FilledButton(onPressed: () async {
                          final labels = <String>[
                            for (final goal in goals) 'Rating 1–5: ${(goal as Map)['title']}',
                            'Written assessment',
                          ];
                          final values = await recordForm(dialogContext, 'Submit $role assessment', labels);
                          if (values == null || values.length != labels.length) return;
                          final ratings = values.take(goals.length).map((x) => int.tryParse(x.trim())).toList();
                          if (ratings.any((x) => x == null || x < 1 || x > 5) || values.last.trim().isEmpty) {
                            if (dialogContext.mounted) ScaffoldMessenger.of(dialogContext).showSnackBar(
                              const SnackBar(content: Text('Enter ratings from 1 to 5 and written feedback.')));
                            return;
                          }
                          try {
                            await widget.store.call('submitHrPerformanceAssessment', {
                              'reviewId': review['id'], 'kind': role,
                              'ratings': ratings.cast<int>(), 'comment': values.last.trim(),
                            });
                            if (dialogContext.mounted) Navigator.pop(dialogContext);
                            if (mounted) ScaffoldMessenger.of(this.context).showSnackBar(
                              const SnackBar(content: Text('Assessment submitted successfully.')));
                          } catch (error) {
                            if (dialogContext.mounted) ScaffoldMessenger.of(dialogContext).showSnackBar(
                              SnackBar(content: Text('Assessment failed: $error')));
                          }
                        }, child: const Text('Submit assessment')),
                      ),
                    ]),
                  ));
                }),
          ),
          actions: [TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Close'))],
        ),
      );
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Performance reviews unavailable: $error')));
    }
  }

  Future<void> _recruitmentDashboard() async {
    try {
      final data = await widget.store.call('listHrRecruitment', {});
      if (!mounted) return;
      final candidates = (data['candidates'] as List?) ?? [];
      final tasks = (data['tasks'] as List?) ?? [];
      await showDialog<void>(context: context, builder: (dialogContext) => AlertDialog(
        title: const Text('Recruitment & onboarding'),
        content: SizedBox(width: 680, height: 480, child: ListView(children: [
          Text('Candidates (${candidates.length})', style: const TextStyle(fontWeight: FontWeight.bold)),
          if (candidates.isEmpty) const Text('No candidate records yet.'),
          for (final candidate in candidates)
            ListTile(
              title: Text('${candidate['name']} · ${candidate['position']}'),
              subtitle: Text('${candidate['email']} · ${candidate['stage']}'),
              trailing: PopupMenuButton<String>(
                tooltip: 'Advance application',
                onSelected: (stage) async {
                  String reason = '';
                  if (stage == 'rejected' || stage == 'withdrawn') {
                    final input = await recordForm(dialogContext, 'Close application', ['Reason']);
                    if (input == null || input[0].trim().isEmpty) return;
                    reason = input[0].trim();
                  }
                  try {
                    await widget.store.call('advanceHrCandidate', {
                      'applicationId': candidate['id'], 'stage': stage, 'reason': reason,
                    });
                    if (dialogContext.mounted) Navigator.pop(dialogContext);
                    if (mounted) ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Candidate updated. Reopen to refresh.')));
                  } catch (error) {
                    if (dialogContext.mounted) ScaffoldMessenger.of(dialogContext).showSnackBar(
                      SnackBar(content: Text('Update failed: $error')));
                  }
                },
                itemBuilder: (_) => <String>['screening','interview','offer','hired','rejected','withdrawn']
                  .map((stage) => PopupMenuItem(value: stage, child: Text(stage))).toList(),
              ),
            ),
          const Divider(),
          Text('Onboarding tasks (${tasks.length})', style: const TextStyle(fontWeight: FontWeight.bold)),
          if (tasks.isEmpty) const Text('No onboarding tasks yet.'),
          for (final task in tasks)
            ListTile(title: Text(task['title'].toString()),
              subtitle: Text('Due ${task['dueDate']} · ${task['status']}'),
              trailing: task['status'] == 'open' ? TextButton(
                onPressed: () async {
                  try {
                    await widget.store.call('completeHrOnboardingTask', {'taskId': task['id']});
                    if (dialogContext.mounted) Navigator.pop(dialogContext);
                    if (mounted) ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Onboarding task completed.')));
                  } catch (error) {
                    if (dialogContext.mounted) ScaffoldMessenger.of(dialogContext).showSnackBar(
                      SnackBar(content: Text('Completion failed: $error')));
                  }
                }, child: const Text('Complete'),
              ) : null),
        ])),
        actions: [
          TextButton(onPressed: () async {
            final input = await recordForm(dialogContext, 'New candidate', ['Full name','Email','Position']);
            if (input == null) return;
            try {
              await widget.store.call('createHrCandidate', {
                'name':input[0].trim(),'email':input[1].trim(),'position':input[2].trim(),
              });
              if (dialogContext.mounted) Navigator.pop(dialogContext);
              if (mounted) ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Candidate created.')));
            } catch (error) {
              if (dialogContext.mounted) ScaffoldMessenger.of(dialogContext).showSnackBar(
                SnackBar(content: Text('Candidate creation failed: $error')));
            }
          }, child: const Text('Add candidate')),
          TextButton(onPressed: () async {
            final input = await recordForm(dialogContext, 'New onboarding task',
              ['Employee record ID','Task title','Assignee user ID','Due date YYYY-MM-DD']);
            if (input == null) return;
            try {
              await widget.store.call('createHrOnboardingTask', {
                'employeeId':input[0].trim(),'title':input[1].trim(),
                'assigneeUid':input[2].trim(),'dueDate':input[3].trim(),
              });
              if (dialogContext.mounted) Navigator.pop(dialogContext);
              if (mounted) ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Onboarding task created.')));
            } catch (error) {
              if (dialogContext.mounted) ScaffoldMessenger.of(dialogContext).showSnackBar(
                SnackBar(content: Text('Task creation failed: $error')));
            }
          }, child: const Text('Add onboarding task')),
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Close')),
        ],
      ));
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Recruitment dashboard unavailable: $error')));
    }
  }

  Future<void> _payrollTimeRegister() async {
    if(selectedId==null)return;
    final values=await recordForm(context,'HR time register',['Period YYYY-MM']);
    if(values==null||values[0].trim().isEmpty)return;
    final period=values[0].trim(),employeeId=selectedId!;
    try{
      final report=await widget.store.call('getHrPayrollTimeRegister',{'employeeId':employeeId,'period':period});
      final lock=await widget.store.call('getHrPayrollTimeLock',{'employeeId':employeeId,'period':period});
      if(!mounted)return;
      await showDialog<void>(context:context,builder:(dialogContext)=>AlertDialog(
        title:Text('Time register · $period'),
        content:SizedBox(width:480,height:260,child:ListView(children:[
          Text('Net: ${report['totalNetMinutes']} minutes'),
          Text('Approved overtime: ${report['approvedOvertimeMinutes']} minutes'),
          Text('Locked snapshot: ${lock['locked']==true?'Yes':'No'}'),
          const SizedBox(height:8),
          const Text('This is an HR time record only, not payroll posting or wage authorization.'),
        ])),
        actions:[
          if(lock['locked']!=true)TextButton(onPressed:() async {
            try{
              await widget.store.call('lockHrPayrollTimeRegister',{'employeeId':employeeId,'period':period});
              if(dialogContext.mounted)Navigator.pop(dialogContext);
              if(mounted)ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content:Text('HR time snapshot saved. Future changes must be reconciled separately.')));
            }catch(error){
              if(dialogContext.mounted)ScaffoldMessenger.of(dialogContext).showSnackBar(
                SnackBar(content:Text('Time lock failed: $error')));
            }
          },child:const Text('Lock snapshot')),
          TextButton(onPressed:()=>Navigator.pop(dialogContext),child:const Text('Close')),
        ],
      ));
    }catch(error){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text('Register unavailable: $error')));
    }
  }

  Future<void> _overtimePanel() async {
    final employeeId = selectedId;
    if (employeeId == null) return;
    try {
      final result = await widget.store.call('listHrOvertime', {'employeeId': employeeId});
      if (!mounted) return;
      final requests = (result['requests'] as List?) ?? [];
      await showDialog<void>(context: context, builder: (dialogContext) => AlertDialog(
        title: const Text('Overtime requests'),
        content: SizedBox(width: 570, height: 370, child: ListView(children: [
          const Text('Approved overtime is not automatically payable or posted to payroll.'),
          if (requests.isEmpty) const Text('No overtime requests yet.'),
          for (final request in requests)
            ListTile(
              title: Text('${request['minutes']} minutes · ${request['status']}'),
              subtitle: Text(request['reason']?.toString() ?? ''),
              trailing: request['status'] == 'pending'
                ? PopupMenuButton<String>(
                    tooltip: 'HR overtime decision',
                    onSelected: (status) async {
                      final note = await recordForm(dialogContext, 'Overtime decision', ['Decision note']);
                      if (note == null || note[0].trim().isEmpty) return;
                      try {
                        await widget.store.call('decideHrOvertime', {
                          'overtimeId': request['id'], 'status': status, 'note': note[0].trim(),
                        });
                        if (dialogContext.mounted) Navigator.pop(dialogContext);
                        if (mounted) ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Decision recorded. Reopen to refresh.')));
                      } catch (error) {
                        if (dialogContext.mounted) ScaffoldMessenger.of(dialogContext).showSnackBar(
                          SnackBar(content: Text('Decision failed: $error')));
                      }
                    },
                    itemBuilder: (_) => const [
                      PopupMenuItem(value: 'approved', child: Text('Approve')),
                      PopupMenuItem(value: 'rejected', child: Text('Reject')),
                    ],
                  )
                : null,
            ),
        ])),
        actions: [
          TextButton(onPressed: () async {
            final values = await recordForm(dialogContext, 'Request overtime',
              ['Approved timesheet / shift ID', 'Overtime minutes', 'Reason']);
            if (values == null) return;
            final minutes = int.tryParse(values[1].trim());
            if (minutes == null) {
              if (dialogContext.mounted) ScaffoldMessenger.of(dialogContext).showSnackBar(
                const SnackBar(content: Text('Overtime minutes must be a whole number.')));
              return;
            }
            try {
              await widget.store.call('requestHrOvertime', {
                'timesheetId': values[0].trim(), 'minutes': minutes, 'reason': values[2].trim(),
              });
              if (dialogContext.mounted) Navigator.pop(dialogContext);
              if (mounted) ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Overtime request submitted.')));
            } catch (error) {
              if (dialogContext.mounted) ScaffoldMessenger.of(dialogContext).showSnackBar(
                SnackBar(content: Text('Overtime request failed: $error')));
            }
          }, child: const Text('Request overtime')),
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Close')),
        ],
      ));
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Overtime unavailable: $error')));
    }
  }

  Future<void> _timesheetPanel() async {
    final employeeId=selectedId;
    if(employeeId==null)return;
    try {
      final results=await Future.wait([
        widget.store.call('listHrTimesheets',{'employeeId':employeeId}),
        widget.store.call('listMyHrShifts',{'employeeId':employeeId}),
      ]);
      if(!mounted)return;
      final sheets=(results[0]['timesheets'] as List?)??[];
      final shifts=(results[1]['shifts'] as List?)??[];
      await showDialog<void>(context:context,builder:(dialogContext)=>AlertDialog(
        title:const Text('Timesheets & approvals'),
        content:SizedBox(width:600,height:440,child:ListView(children:[
          const Text('Clock records require supervisor review. No automatic payroll posting.'),
          const Divider(),
          const Text('TIMESHEETS',style:TextStyle(fontWeight:FontWeight.bold)),
          if(sheets.isEmpty)const Text('No submitted timesheets.'),
          for(final sheet in sheets)
            ListTile(title:Text('${sheet['status']} · ${sheet['netMinutes']} net minutes'),
              subtitle:Text('Unpaid break: ${sheet['unpaidBreakMinutes']} minutes'),
              trailing:sheet['status']=='pending'?Wrap(mainAxisSize:MainAxisSize.min,children:[
                TextButton(onPressed:() async {
                  final values=await recordForm(dialogContext,'Approve timesheet',['Decision note']);
                  if(values==null||values[0].trim().isEmpty)return;
                  try{
                    await widget.store.call('decideHrTimesheet',{
                      'timesheetId':sheet['id'],'status':'approved','note':values[0].trim()});
                    if(dialogContext.mounted)Navigator.pop(dialogContext);
                  }catch(error){
                    if(dialogContext.mounted)ScaffoldMessenger.of(dialogContext).showSnackBar(
                      SnackBar(content:Text('Approval unavailable: $error')));
                  }
                },child:const Text('Approve')),
                TextButton(onPressed:() async {
                  final values=await recordForm(dialogContext,'Reject timesheet',['Decision note']);
                  if(values==null||values[0].trim().isEmpty)return;
                  try{
                    await widget.store.call('decideHrTimesheet',{
                      'timesheetId':sheet['id'],'status':'rejected','note':values[0].trim()});
                    if(dialogContext.mounted)Navigator.pop(dialogContext);
                  }catch(error){
                    if(dialogContext.mounted)ScaffoldMessenger.of(dialogContext).showSnackBar(
                      SnackBar(content:Text('Rejection unavailable: $error')));
                  }
                },child:const Text('Reject')),
              ]):null,
            ),
          const Divider(),
          const Text('SCHEDULED SHIFTS',style:TextStyle(fontWeight:FontWeight.bold)),
          for(final shift in shifts)
            if(shift['status']=='scheduled')
              ListTile(title:Text(shift['title']?.toString()??'Shift'),
                subtitle:Text('${shift['startAt']} – ${shift['endAt']}'),
                trailing:TextButton(onPressed:() async {
                  final values=await recordForm(dialogContext,'Submit timesheet',
                    ['Unpaid break minutes','Explanation of clock records']);
                  if(values==null)return;
                  try{
                    await widget.store.call('submitHrTimesheet',{
                      'shiftId':shift['id'],
                      'unpaidBreakMinutes':int.parse(values[0].trim()),
                      'reason':values[1].trim(),
                    });
                    if(dialogContext.mounted)Navigator.pop(dialogContext);
                  }catch(error){
                    if(dialogContext.mounted)ScaffoldMessenger.of(dialogContext).showSnackBar(
                      SnackBar(content:Text('Submission failed: $error')));
                  }
                },child:const Text('Submit')),
              ),
        ])),
        actions:[TextButton(onPressed:()=>Navigator.pop(dialogContext),child:const Text('Close'))],
      ));
    }catch(error){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text('Timesheets unavailable: $error')));
    }
  }

  Future<void> _attendanceReconciliation() async {
    final employeeId=selectedId;
    if(employeeId==null)return;
    try {
      final data=await widget.store.call('getHrShiftAttendanceReconciliation',{'employeeId':employeeId});
      if(!mounted)return;
      final rows=(data['results'] as List?)??[];
      await showDialog<void>(context:context,builder:(dialogContext)=>AlertDialog(
        title:const Text('Shift & attendance exceptions'),
        content:SizedBox(width:570,height:390,child:ListView(children:[
          const Text('Raw clock events only. No hours here are approved for payroll.'),
          if(rows.isEmpty)const Text('No scheduled shifts to compare.'),
          for(final entry in rows)
            ListTile(
              title:Text('${entry['status']} · ${entry['startAt']}'),
              subtitle:Text('Scheduled: ${entry['scheduledMinutes']} min · Recorded: ${entry['workedMinutes'] ?? 'missing'} min\nLate: ${entry['lateMinutes'] ?? '—'} min · Early: ${entry['earlyDepartureMinutes'] ?? '—'} min'),
            ),
        ])),
        actions:[TextButton(onPressed:()=>Navigator.pop(dialogContext),child:const Text('Close'))],
      ));
    }catch(error){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text('Reconciliation unavailable: $error')));
    }
  }

  Future<void> _shiftPlanner() async {
    final employeeId = selectedId;
    if (employeeId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select an employee to view shifts.')));
      return;
    }
    try {
      final data = await widget.store.call('listMyHrShifts', {'employeeId': employeeId});
      if (!mounted) return;
      final shifts = (data['shifts'] as List?) ?? [];
      await showDialog<void>(context: context, builder: (dialogContext) => AlertDialog(
        title: const Text('Workforce schedule'),
        content: SizedBox(width: 560,height: 360,child: ListView(children: [
          const Text('Schedules are not verified attendance or payable overtime.'),
          if (shifts.isEmpty) const Text('No shifts assigned.'),
          for (final shift in shifts)
            ListTile(
              title: Text(shift['title']?.toString() ?? 'Shift'),
              subtitle: Text('${shift['startAt']} – ${shift['endAt']} · ${shift['status']}'),
              trailing: shift['status']=='scheduled' ? IconButton(
                tooltip: 'Cancel shift (HR owner)',
                icon: const Icon(Icons.event_busy_outlined),
                onPressed: () async {
                  try {
                    await widget.store.call('cancelHrShift', {'shiftId': shift['id']});
                    if (dialogContext.mounted) Navigator.pop(dialogContext);
                    if (mounted) ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Shift cancelled. Reopen to refresh.')));
                  } catch (error) {
                    if (dialogContext.mounted) ScaffoldMessenger.of(dialogContext).showSnackBar(
                      SnackBar(content: Text('Cancellation failed: $error')));
                  }
                },
              ) : null,
            ),
        ])),
        actions: [
          TextButton(onPressed: () async {
            final values=await recordForm(dialogContext,'Assign shift',
              ['Shift title','Start UTC YYYY-MM-DDTHH:MM:SSZ','End UTC YYYY-MM-DDTHH:MM:SSZ']);
            if(values==null)return;
            try {
              await widget.store.call('scheduleHrShift',{
                'employeeId':employeeId,'title':values[0].trim(),
                'startAt':values[1].trim(),'endAt':values[2].trim(),
              });
              if(dialogContext.mounted)Navigator.pop(dialogContext);
              if(mounted)ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Shift scheduled. Reopen to refresh.')));
            } catch(error) {
              if(dialogContext.mounted)ScaffoldMessenger.of(dialogContext).showSnackBar(
                SnackBar(content: Text('Shift scheduling failed: $error')));
            }
          },child:const Text('Assign shift')),
          TextButton(onPressed:()=>Navigator.pop(dialogContext),child:const Text('Close')),
        ],
      ));
    } catch(error) {
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text('Schedule unavailable: $error')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final store = widget.store;
    return DefaultTabController(
      length: 2,
      child: Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.badge_rounded, color: Color(0xFFEC4899)),
            SizedBox(width: 10),
            Text('People & Attendance System'),
          ],
        ),
        bottom: const TabBar(
          tabs: [
            Tab(icon: Icon(Icons.groups_rounded), text: 'People'),
            Tab(icon: Icon(Icons.psychology_alt_rounded), text: 'Talent insights'),
          ],
        ),
      ),
      body: TabBarView(
        children: [
          _peopleTab(context, store),
          HiringInsightsPanel(store: store),
        ],
      ),
      ),
    );
  }

  Widget _peopleTab(BuildContext context, SuiteStore store) {
    return SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('EMPLOYEE DIRECTORY & CLOCK-IN STATUS', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
            const SizedBox(height: 8),
            const Text('Select an employee. Payroll uses the February 2026 PAYE, NSSF, SHIF and housing levy card and posts a balanced journal. It does not file a KRA return or send M-Pesa.'),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton.icon(
                  onPressed: selectedId == null ? null : _payrollTimeRegister,
                  icon: const Icon(Icons.lock_clock_outlined),
                  label: const Text('Payroll time register'),
                ),
                OutlinedButton.icon(
                  onPressed: selectedId == null ? null : _overtimePanel,
                  icon: const Icon(Icons.more_time_outlined),
                  label: const Text('Overtime'),
                ),
                OutlinedButton.icon(
                  onPressed: selectedId == null ? null : _timesheetPanel,
                  icon: const Icon(Icons.assignment_turned_in_outlined),
                  label: const Text('Timesheets'),
                ),
                OutlinedButton.icon(
                  onPressed: selectedId == null ? null : _attendanceReconciliation,
                  icon: const Icon(Icons.rule_outlined),
                  label: const Text('Attendance exceptions'),
                ),
                OutlinedButton.icon(
                  onPressed: selectedId == null ? null : _shiftPlanner,
                  icon: const Icon(Icons.schedule_outlined),
                  label: const Text('Workforce schedule'),
                ),
                OutlinedButton.icon(
                  onPressed: _recruitmentDashboard,
                  icon: const Icon(Icons.work_outline),
                  label: const Text('Recruitment & onboarding'),
                ),
                OutlinedButton.icon(
                  onPressed: _performanceReviews,
                  icon: const Icon(Icons.assessment_outlined),
                  label: const Text('Performance reviews'),
                ),
                OutlinedButton.icon(
                  onPressed: _approvalInbox,
                  icon: const Icon(Icons.fact_check_outlined),
                  label: const Text('Approval inbox'),
                ),
                OutlinedButton.icon(
                  onPressed: selectedId == null ? null : _requestLeave,
                  icon: const Icon(Icons.event_available_outlined),
                  label: const Text('Request leave'),
                ),
                OutlinedButton.icon(
                  onPressed: selectedId == null ? null : _showLeaveBalance,
                  icon: const Icon(Icons.calendar_month_outlined),
                  label: const Text('Leave balance'),
                ),
                OutlinedButton.icon(
                  onPressed: selectedId == null ? null : _showLeaveHistory,
                  icon: const Icon(Icons.history),
                  label: const Text('Leave history'),
                ),
                ElevatedButton.icon(
                  onPressed: runPayroll,
                  icon: const Icon(Icons.payments_rounded, size: 16),
                  label: Text(selectedId == null ? 'Run Payroll' : 'Run Payroll for $selectedId'),
                ),
                ElevatedButton.icon(
                  onPressed: () async {
                    final details = await recordForm(context, 'Add New Staff Member', ['Full Name', 'Job Role', 'Department', 'Branch', 'Skills (comma separated)']);
                    if (details != null && details[0].isNotEmpty) {
                      await store.call('saveRecord', {
                        'appId': 'hr',
                        'record': {
                          'name': details[0],
                          'role': details[1],
                          'department': details[2],
                          'branch': details[3],
                          'skills': details[4],
                          'status': 'CLOCKED_IN',
                          'clockTime': '08:00 AM',
                        }
                      });
                    }
                  },
                  icon: const Icon(Icons.person_add_alt_1_rounded, size: 16),
                  label: const Text('Add Employee'),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFEC4899), foregroundColor: Colors.white),
                ),
              ],
            ),
            const SizedBox(height: 16),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('employees'),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const CircularProgressIndicator();
                final staff = snapshot.data!;
                return Card(
                  child: ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: staff.length,
                    separatorBuilder: (context, index) => const Divider(height: 1),
                    itemBuilder: (context, idx) {
                      final e = staff[idx];
                      final isClockedIn = e['status'] == 'CLOCKED_IN';
                      return ListTile(
                        selected: selectedId == e['id'],
                        onTap: () => setState(() => selectedId = e['id'] as String?),
                        leading: CircleAvatar(
                          backgroundColor: const Color(0xFFEC4899).withValues(alpha: 0.1),
                          child: Text(e['name'][0], style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFFEC4899))),
                        ),
                        title: Text(e['name'], style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('${e['id']} · ${e['role']} · ${e['department']} · ${e['branch']}'),
                        trailing: Chip(
                          label: Text(isClockedIn ? 'Clocked in at ${e['clockTime']}' : e['status']),
                          backgroundColor: isClockedIn ? const Color(0xFFD1FAE5) : const Color(0xFFFEE2E2),
                        ),
                      );
                    },
                  ),
                );
              },
            ),
            const SizedBox(height: 24),
            const Text('STATUTORY PAYSLIPS', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
            const SizedBox(height: 12),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('payrollPayslips'),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const CircularProgressIndicator();
                final slips = snapshot.data!;
                if (slips.isEmpty) return const Text('No payslips yet.');
                return Card(
                  child: ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: slips.length,
                    separatorBuilder: (context, index) => const Divider(height: 1),
                    itemBuilder: (context, idx) {
                      final slip = slips[idx];
                      return ListTile(
                        title: Text('${slip['employeeName'] ?? slip['employeeId']} · ${slip['period']}', style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('PAYE ${kes((slip['payeMinor'] as num?) ?? 0)} · NSSF ${kes((slip['nssfEmployeeMinor'] as num?) ?? 0)} · SHIF ${kes((slip['shifMinor'] as num?) ?? 0)} · Housing ${kes((slip['housingEmployeeMinor'] as num?) ?? 0)} · ${slip['rateCard']}'),
                        trailing: Text(kes((slip['netMinor'] as num?) ?? 0), style: const TextStyle(fontWeight: FontWeight.bold)),
                      );
                    },
                  ),
                );
              },
            ),
          ],
        ),
      );
  }
}
