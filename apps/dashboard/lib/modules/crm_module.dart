import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

class CrmModuleScreen extends StatefulWidget {
  final SuiteStore store;
  const CrmModuleScreen({super.key, required this.store});
  @override State<CrmModuleScreen> createState()=>_CrmModuleScreenState();
}

class _CrmModuleScreenState extends State<CrmModuleScreen>{
  String query='';
  bool saving=false;

  Future<void> addContact() async{
    final details=await recordForm(context,'Add CRM Customer',['Company / Person Name','Email','Phone Number','Location']);
    if(details==null||details.isEmpty||details[0].trim().isEmpty)return;
    setState(()=>saving=true);
    try{
      await widget.store.call('saveRecord',{'appId':'crm','record':{
        'name':details[0].trim(),'email':details.length>1?details[1].trim():'',
        'phone':details.length>2?details[2].trim():'','location':details.length>3?details[3].trim():'',
        'type':'Lead','balanceKes':0,
      }});
    }catch(e){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('Could not save contact: $e'),backgroundColor:Colors.red.shade700));
    }finally{if(mounted)setState(()=>saving=false);}
  }

  Future<void> contactTimeline(Map<String,dynamic> contact) async {
    final contactId=contact['id']?.toString();
    if(contactId==null||contactId.isEmpty){
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Contact record ID unavailable.')));
      return;
    }
    try {
      final data=await widget.store.call('listCrmActivityTimeline',{'contactId':contactId});
      if(!mounted)return;
      final rows=(data['activities'] as List?)??[];
      await showDialog<void>(context:context,builder:(dialogContext)=>AlertDialog(
        title:Text('Activity · ${contact['name']??'Contact'}'),
        content:SizedBox(width:570,height:410,child:ListView(children:[
          const Text('Manually logged interactions; no mailbox or WhatsApp synchronization.'),
          if(rows.isEmpty)const Text('No interactions logged.'),
          for(final item in rows)
            ListTile(title:Text('${item['type']} · ${item['occurredAt']}'),
              subtitle:Text(item['summary']?.toString()??'')),
        ])),
        actions:[
          TextButton(onPressed:() async {
            final details=await recordForm(dialogContext,'Log interaction',
              ['Type: call / meeting / email / whatsapp / note','Interaction summary']);
            if(details==null)return;
            try{
              final now=DateTime.now().toUtc().toIso8601String().split('.').first+'Z';
              await widget.store.call('logCrmActivity',{
                'contactId':contactId,'type':details[0].trim().toLowerCase(),
                'summary':details[1].trim(),'occurredAt':now,
              });
              if(dialogContext.mounted)Navigator.pop(dialogContext);
              if(mounted)ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content:Text('Interaction logged. Reopen timeline to refresh.')));
            }catch(error){
              if(dialogContext.mounted)ScaffoldMessenger.of(dialogContext).showSnackBar(
                SnackBar(content:Text('Activity could not be logged: $error')));
            }
          },child:const Text('Log interaction')),
          TextButton(onPressed:()=>Navigator.pop(dialogContext),child:const Text('Close')),
        ],
      ));
    }catch(error){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text('Activity timeline unavailable: $error')));
    }
  }

  Future<void> contactPreferences(Map<String,dynamic> contact) async {
    final id=contact['id']?.toString();
    if(id==null||id.isEmpty)return;
    try {
      final data=await widget.store.call('getCrmContactSuppression',{'contactId':id});
      if(!mounted)return;
      await showDialog<void>(context:context,builder:(dialogContext)=>AlertDialog(
        title:Text('Outreach preferences · ${contact['name']??'Contact'}'),
        content:Column(mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text('Global do-not-contact: ${data['doNotContact']==true?'Yes':'No'}'),
          Text('Suppressed channels: ${(data['blockedChannels'] as List? ?? []).join(', ')}'),
          const SizedBox(height:10),
          const Text('A new opt-out stops matching active enrollments. Messages are not sent automatically.'),
        ]),
        actions:[TextButton(onPressed:()=>Navigator.pop(dialogContext),child:const Text('Close'))],
      ));
    }catch(error){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text('Preferences unavailable: $error')));
    }
  }

  Future<void> salesSequences() async {
    try {
      final data=await widget.store.call('listCrmSequences',{});
      if(!mounted)return;
      final templates=(data['templates'] as List?)??[];
      final enrollments=(data['enrollments'] as List?)??[];
      await showDialog<void>(context:context,builder:(dialogContext)=>AlertDialog(
        title:const Text('Sales sequences · manual'),
        content:SizedBox(width:620,height:460,child:ListView(children:[
          const Text('Planning only: no automatic email, WhatsApp or call sending. Record consent evidence before enrolling contacts.'),
          const Divider(),
          const Text('TEMPLATES',style:TextStyle(fontWeight:FontWeight.bold)),
          if(templates.isEmpty)const Text('No sequences yet.'),
          for(final template in templates)ListTile(
            title:Text(template['name']?.toString()??'Sequence'),
            subtitle:Text('Status: ${template['status']} · Steps: ${(template['steps'] as List?)?.length??0}'),
            trailing:template['status']=='draft'?Wrap(mainAxisSize:MainAxisSize.min,children:[
              TextButton(onPressed:() async {
                final v=await recordForm(dialogContext,'Add sequence step',['Channel email / whatsapp / call','Delay days','Subject','Message']);
                if(v==null)return;
                final days=int.tryParse(v[1].trim());
                if(days==null)return;
                try {
                  await widget.store.call('addCrmSequenceStep',{'sequenceId':template['id'],
                    'step':{'channel':v[0].trim().toLowerCase(),'delayDays':days,'subject':v[2].trim(),'body':v[3].trim()}});
                  if(dialogContext.mounted)Navigator.pop(dialogContext);
                }catch(error){
                  if(dialogContext.mounted)ScaffoldMessenger.of(dialogContext).showSnackBar(SnackBar(content:Text('Step failed: $error')));
                }
              },child:const Text('Add step')),
              TextButton(
              onPressed:() async {
                try{
                  await widget.store.call('activateCrmSequence',{'sequenceId':template['id']});
                  if(dialogContext.mounted)Navigator.pop(dialogContext);
                }catch(error){
                  if(dialogContext.mounted)ScaffoldMessenger.of(dialogContext).showSnackBar(SnackBar(content:Text('Activation failed: $error')));
                }
              },child:const Text('Activate'))]):null,
          ),
          const Divider(),
          const Text('ENROLLMENTS',style:TextStyle(fontWeight:FontWeight.bold)),
          for(final item in enrollments)ListTile(
            title:Text('Contact ${item['contactId']} · ${item['channel']}'),
            subtitle:Text('Status: ${item['status']}'),
            trailing:item['status']=='active'?TextButton(onPressed:() async {
              final values=await recordForm(dialogContext,'Stop sequence',['Reason']);
              if(values==null||values[0].trim().isEmpty)return;
              try{
                await widget.store.call('stopCrmSequenceEnrollment',{'enrollmentId':item['id'],'reason':values[0].trim()});
                if(dialogContext.mounted)Navigator.pop(dialogContext);
              }catch(error){
                if(dialogContext.mounted)ScaffoldMessenger.of(dialogContext).showSnackBar(SnackBar(content:Text('Stopping failed: $error')));
              }
            },child:const Text('Stop')):null,
          ),
        ])),
        actions:[
          TextButton(onPressed:() async {
            final fields=await recordForm(dialogContext,'Create sequence template',
              ['Sequence name','Channel: email / whatsapp / call','Step delay (days)','Subject','Message / talking points']);
            if(fields==null)return;
            final delay=int.tryParse(fields[2].trim());
            if(delay==null)return;
            try{
              await widget.store.call('createCrmSequence',{
                'name':fields[0].trim(),'steps':[{
                  'channel':fields[1].trim().toLowerCase(),'delayDays':delay,
                  'subject':fields[3].trim(),'body':fields[4].trim(),
                }],
              });
              if(dialogContext.mounted)Navigator.pop(dialogContext);
            }catch(error){
              if(dialogContext.mounted)ScaffoldMessenger.of(dialogContext).showSnackBar(SnackBar(content:Text('Template failed: $error')));
            }
          },child:const Text('New template')),
          TextButton(onPressed:() async {
            final fields=await recordForm(dialogContext,'Enroll with documented consent',
              ['Active sequence ID','Contact ID','Channel','Consent evidence / source']);
            if(fields==null)return;
            try{
              await widget.store.call('enrollCrmSequence',{
                'sequenceId':fields[0].trim(),'contactId':fields[1].trim(),
                'channel':fields[2].trim().toLowerCase(),
                'consent':{'channel':fields[2].trim().toLowerCase(),'granted':true,
                  'evidence':fields[3].trim()},
              });
              if(dialogContext.mounted)Navigator.pop(dialogContext);
            }catch(error){
              if(dialogContext.mounted)ScaffoldMessenger.of(dialogContext).showSnackBar(SnackBar(content:Text('Enrollment failed: $error')));
            }
          },child:const Text('Enroll contact')),
          TextButton(onPressed:() async {
            final v=await recordForm(dialogContext,'Suppress outreach channel',
              ['Contact ID','Channel: email / whatsapp / call / all','Reason for opt-out']);
            if(v==null)return;
            try {
              await widget.store.call('suppressCrmContactChannel',{
                'contactId':v[0].trim(),'channel':v[1].trim().toLowerCase(),'reason':v[2].trim()});
              if(dialogContext.mounted)Navigator.pop(dialogContext);
            }catch(error){
              if(dialogContext.mounted)ScaffoldMessenger.of(dialogContext).showSnackBar(
                SnackBar(content:Text('Suppression failed: $error')));
            }
          },child:const Text('Record opt-out')),
          TextButton(onPressed:()=>Navigator.pop(dialogContext),child:const Text('Close')),
        ],
      ));
    }catch(error){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('Sequences unavailable: $error')));
    }
  }

  Future<void> leadScores() async {
    try {
      final result=await widget.store.call('getCrmLeadScores',{});
      if(!mounted)return;
      final scores=(result['scores'] as List?)??[];
      await showDialog<void>(context:context,builder:(dialogContext)=>AlertDialog(
        title:const Text('Lead prioritization'),
        content:SizedBox(width:560,height:460,child:ListView(children:[
          const Text('Explainable rule-based signals, not purchase predictions.'),
          if(scores.isEmpty)const Text('No CRM contacts found.'),
          for(final lead in scores)ExpansionTile(
            title:Text('Contact ${lead['contactId']} · ${lead['score']}/100'),
            subtitle:Text('Priority: ${lead['band']}'),
            children:[
              for(final reason in (lead['reasons'] as List? ?? []))
                ListTile(dense:true,title:Text(reason['reason'].toString()),
                  trailing:Text('${reason['points']} pts')),
            ],
          ),
        ])),
        actions:[TextButton(onPressed:()=>Navigator.pop(dialogContext),child:const Text('Close'))],
      ));
    }catch(error){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text('Lead scoring unavailable: $error')));
    }
  }

  Future<void> commerceSummary() async {
    try {
      final report=await widget.store.call('getCrmCommerceSummary',{});
      if(!mounted)return;
      final customers=(report['customers'] as List?)??[];
      await showDialog<void>(context:context,builder:(dialogContext)=>AlertDialog(
        title:const Text('CRM · POS · Accounting'),
        content:SizedBox(width:680,height:480,child:ListView(children:[
          const Text('Read-only snapshot. POS sales, invoices and won deals may refer to the same transaction. Do not add their values together.'),
          if(customers.isEmpty)const Text('No customer records available.'),
          for(final customer in customers)ExpansionTile(
            title:Text(customer['name']?.toString()??'Customer'),
            subtitle:Text('POS sales: ${customer['posSaleCount']} · Invoices: ${customer['invoiceCount']}'),
            children:[
              ListTile(title:const Text('Won opportunity value'),
                trailing:Text('${customer['wonOpportunityMinor']} minor units')),
              ListTile(title:const Text('POS recorded sales'),
                trailing:Text('${customer['posSaleMinor']} minor units')),
              ListTile(title:const Text('Invoiced amount'),
                trailing:Text('${customer['invoiceMinor']} minor units')),
              ListTile(title:const Text('Invoices marked paid (unverified)'),
                trailing:Text('${customer['paidInvoiceStatusCount']}')),
            ],
          ),
        ])),
        actions:[TextButton(onPressed:()=>Navigator.pop(dialogContext),child:const Text('Close'))],
      ));
    }catch(error){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text('Commerce summary unavailable: $error')));
    }
  }

  Future<void> campaignEfficiencyReport() async {
    try {
      final report=await widget.store.call('getCrmCampaignEfficiency',{});
      if(!mounted)return;
      final rows=(report['results'] as List?)??[];
      await showDialog<void>(context:context,builder:(dialogContext)=>AlertDialog(
        title:const Text('Campaign acquisition costs'),
        content:SizedBox(width:620,height:420,child:ListView(children:[
          const Text('Manual KES campaign spend, not reconciled accounting costs or realized ROI.'),
          for(final item in rows)ListTile(
            title:Text(item['name']?.toString()??'Campaign'),
            subtitle:Text('Spend: ${item['spendMinor']} · Cost/opportunity: ${item['spendPerOpportunityMinor']??'N/A'} · Cost/won deal: ${item['spendPerWonDealMinor']??'N/A'} (minor units)'),
            trailing:Text('${item['opportunities']} deals'),
          ),
        ])),
        actions:[
          TextButton(onPressed:() async {
            final v=await recordForm(dialogContext,'Record campaign spend',
              ['Campaign ID','Amount KES','Expense date YYYY-MM-DD','Description']);
            if(v==null)return;
            final amount=double.tryParse(v[1].trim());
            if(amount==null||!amount.isFinite||amount<=0)return;
            try {
              await widget.store.call('recordCrmCampaignSpend',{
                'campaignId':v[0].trim(),'amountMinor':(amount*100).round(),
                'occurredOn':v[2].trim(),'note':v[3].trim(),
              });
              if(dialogContext.mounted)Navigator.pop(dialogContext);
            }catch(error){
              if(dialogContext.mounted)ScaffoldMessenger.of(dialogContext).showSnackBar(
                SnackBar(content:Text('Spend could not be saved: $error')));
            }
          },child:const Text('Record spend')),
          TextButton(onPressed:()=>Navigator.pop(dialogContext),child:const Text('Close')),
        ],
      ));
    }catch(error){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text('Campaign efficiency unavailable: $error')));
    }
  }

  Future<void> campaignReport() async {
    try{
      final report=await widget.store.call('getCrmCampaignAttribution',{});
      if(!mounted)return;
      final campaigns=(report['campaigns'] as List?)??[];
      await showDialog<void>(context:context,builder:(dialogContext)=>AlertDialog(
        title:const Text('Campaign attribution'),
        content:SizedBox(width:620,height:410,child:ListView(children:[
          const Text('Single-source attribution to opportunities; won value is not collected revenue.'),
          if(campaigns.isEmpty)const Text('No campaigns recorded.'),
          for(final campaign in campaigns)ListTile(
            title:Text(campaign['name']?.toString()??'Campaign'),
            subtitle:Text('Source: ${campaign['source']} · Deals: ${campaign['opportunities']} · Won: ${campaign['won']} · Lost: ${campaign['lost']}'),
            trailing:Text('${campaign['wonOpportunityMinor']} minor units'),
          ),
        ])),
        actions:[
          TextButton(onPressed:() async {
            final details=await recordForm(dialogContext,'Create acquisition campaign',
              ['Campaign name','Source: organic / referral / paid_search / paid_social / email / events / partner / direct / other']);
            if(details==null)return;
            try {
              await widget.store.call('createCrmCampaign',{'name':details[0].trim(),'source':details[1].trim().toLowerCase()});
              if(dialogContext.mounted)Navigator.pop(dialogContext);
            }catch(error){
              if(dialogContext.mounted)ScaffoldMessenger.of(dialogContext).showSnackBar(SnackBar(content:Text('Campaign creation failed: $error')));
            }
          },child:const Text('New campaign')),
          TextButton(onPressed:()=>Navigator.pop(dialogContext),child:const Text('Close')),
        ],
      ));
    }catch(error){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('Campaign report unavailable: $error')));
    }
  }

  Future<void> salesCycleReport() async {
    final input=await recordForm(context,'Sales cycle report',['Period YYYY-MM']);
    if(input==null)return;
    try{
      final data=await widget.store.call('getCrmSalesCycleReport',{'period':input[0].trim()});
      if(!mounted)return;
      final transitionMap=(data['transitions'] as Map?)??{};
      await showDialog<void>(context:context,builder:(dialogContext)=>AlertDialog(
        title:Text('Sales cycle · ${data['period']}'),
        content:SizedBox(width:540,height:420,child:ListView(children:[
          Text('Closed deals: ${data['closedDeals']}'),
          Text('Deals with measurable cycle: ${data['measuredSalesCycles']}'),
          Text('Average days to close: ${data['averageDaysToClose']??'Unknown'}'),
          Text('Missing evidence indicators: ${data['unknownEvidenceCount']}'),
          const SizedBox(height:12),
          const Text('Recorded stage transitions',style:TextStyle(fontWeight:FontWeight.bold)),
          for(final stage in transitionMap.entries)
            for(final next in (stage.value as Map).entries)
              if(next.value is num && next.value>0)
                ListTile(dense:true,title:Text('${stage.key} → ${next.key}'),
                  trailing:Text('${next.value}')),
          const Text('Only observed transitions for closed deals are counted. This is not a cohort conversion probability.'),
        ])),
        actions:[TextButton(onPressed:()=>Navigator.pop(dialogContext),child:const Text('Close'))],
      ));
    }catch(error){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('Sales cycle report unavailable: $error')));
    }
  }

  Future<void> conversionReport() async {
    final input=await recordForm(context,'Win / loss report',['Period YYYY-MM']);
    if(input==null)return;
    try{
      final data=await widget.store.call('getCrmConversionReport',{'period':input[0].trim()});
      if(!mounted)return;
      final reasons=(data['lossReasons'] as List?)??[];
      await showDialog<void>(context:context,builder:(dialogContext)=>AlertDialog(
        title:Text('Win / loss · ${data['period']}'),
        content:SizedBox(width:510,height:330,child:ListView(children:[
          Text('Won: ${data['won']} · Lost: ${data['lost']}'),
          Text('Closed-deal win rate: ${data['closedWinRatePercent']??'N/A'}%'),
          Text('Won opportunity value (minor units): ${data['wonValueMinor']}'),
          const SizedBox(height:10),
          const Text('Recorded loss reasons',style:TextStyle(fontWeight:FontWeight.bold)),
          for(final reason in reasons)ListTile(title:Text(reason['reason'].toString()),trailing:Text('${reason['count']}')),
          const Text('This is a closed-deal snapshot, not a stage-to-stage historical conversion funnel.'),
        ])),
        actions:[TextButton(onPressed:()=>Navigator.pop(dialogContext),child:const Text('Close'))],
      ));
    }catch(error){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('Win/loss report unavailable: $error')));
    }
  }

  Future<void> agingReport() async {
    try {
      final report=await widget.store.call('getCrmPipelineAging',{'thresholdDays':14});
      if(!mounted)return;
      final rows=(report['rows'] as List?)??[];
      await showDialog<void>(context:context,builder:(dialogContext)=>AlertDialog(
        title:const Text('Stalled deal analysis'),
        content:SizedBox(width:620,height:440,child:ListView(children:[
          Text('Open: ${report['openDeals']} · Stalled 14+ days: ${report['stalledDeals']} · Unknown age: ${report['unknownAgeDeals']}'),
          const Text('Legacy deals without recorded stage-entry dates are not assigned an invented age.'),
          const Divider(),
          for(final row in rows)
            ListTile(
              title:Text(row['title']?.toString()??'Opportunity'),
              subtitle:Text('Stage: ${row['stage']} · Owner: ${row['ownerUid']??'unassigned'}'),
              trailing:Text(row['stageDays']==null?'Unknown':'${row['stageDays']} days'),
            ),
        ])),
        actions:[TextButton(onPressed:()=>Navigator.pop(dialogContext),child:const Text('Close'))],
      ));
    }catch(error){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text('Aging report unavailable: $error')));
    }
  }

  Future<void> quotasAndTerritories() async {
    final periodValues=await recordForm(context,'Sales quota dashboard',['Period YYYY-MM']);
    if(periodValues==null)return;
    final period=periodValues[0].trim();
    try {
      final report=await widget.store.call('getCrmQuotaDashboard',{'period':period});
      if(!mounted)return;
      final attainment=(report['attainment'] as List?)??[];
      final territories=(report['territories'] as List?)??[];
      await showDialog<void>(context:context,builder:(dialogContext)=>AlertDialog(
        title:Text('Sales quotas · $period'),
        content:SizedBox(width:630,height:430,child:ListView(children:[
          const Text('Based on won opportunities with recorded close dates, not realized sales revenue.'),
          const Divider(),
          const Text('QUOTA ATTAINMENT',style:TextStyle(fontWeight:FontWeight.bold)),
          if(attainment.isEmpty)const Text('No quota targets for this month.'),
          for(final item in attainment)
            ListTile(title:Text('Owner ${item['ownerUid']} · ${item['attainmentPercent']}%'),
              subtitle:Text('Target ${item['targetMinor']} · Won value ${item['wonOpportunityMinor']} (minor units)')),
          const Divider(),
          const Text('TERRITORIES',style:TextStyle(fontWeight:FontWeight.bold)),
          for(final territory in territories)
            ListTile(title:Text(territory['name'].toString()),
              subtitle:Text('Assigned owner: ${territory['ownerUid']}')),
        ])),
        actions:[
          TextButton(onPressed:() async {
            final fields=await recordForm(dialogContext,'Set sales quota',['Sales member user ID','Target KES (whole shillings)']);
            if(fields==null)return;
            final amount=int.tryParse(fields[1].trim());
            if(amount==null||amount<=0)return;
            try{
              await widget.store.call('setCrmSalesQuota',{
                'ownerUid':fields[0].trim(),'period':period,'targetMinor':amount*100});
              if(dialogContext.mounted)Navigator.pop(dialogContext);
            }catch(error){
              if(dialogContext.mounted)ScaffoldMessenger.of(dialogContext).showSnackBar(
                SnackBar(content:Text('Quota update failed: $error')));
            }
          },child:const Text('Set quota')),
          TextButton(onPressed:() async {
            final fields=await recordForm(dialogContext,'Assign territory',['Territory name','Sales member user ID']);
            if(fields==null)return;
            try {
              await widget.store.call('setCrmSalesTerritory',{
                'name':fields[0].trim(),'ownerUid':fields[1].trim()});
              if(dialogContext.mounted)Navigator.pop(dialogContext);
            }catch(error){
              if(dialogContext.mounted)ScaffoldMessenger.of(dialogContext).showSnackBar(
                SnackBar(content:Text('Territory update failed: $error')));
            }
          },child:const Text('Assign territory')),
          TextButton(onPressed:()=>Navigator.pop(dialogContext),child:const Text('Close')),
        ],
      ));
    }catch(error){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text('Quota report unavailable: $error')));
    }
  }

  Future<void> teamPerformance() async {
    try{
      final result=await widget.store.call('getCrmTeamPerformance',{});
      if(!mounted)return;
      final team=(result['team'] as List?)??[];
      await showDialog<void>(context:context,builder:(dialogContext)=>AlertDialog(
        title:const Text('Sales team performance'),
        content:SizedBox(width:620,height:420,child:ListView(children:[
          const Text('Current opportunity snapshot; won deal value is not recognized revenue.'),
          if(team.isEmpty)const Text('No assigned opportunities found.'),
          for(final member in team)
            ListTile(
              title:Text('Sales owner ${member['ownerUid']}'),
              subtitle:Text('Open ${member['open']} · Won ${member['won']} · Lost ${member['lost']}\nOpen value: ${member['openValueMinor']} · Won value: ${member['wonValueMinor']} (minor currency units)'),
              trailing:Text('Win rate ${member['winRatePercent']??'N/A'}%'),
            ),
        ])),
        actions:[TextButton(onPressed:()=>Navigator.pop(dialogContext),child:const Text('Close'))],
      ));
    }catch(error){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text('Sales team report unavailable: $error')));
    }
  }

  Future<void> dealBoard() async {
    try {
      final data=await widget.store.call('getCrmPipeline',{});
      if(!mounted)return;
      final deals=(data['opportunities'] as List?)??[];
      final board=(data['board'] as Map?)??{};
      final columns=(board['columns'] as List?)??[];
      await showDialog<void>(context:context,builder:(dialogContext)=>AlertDialog(
        title:const Text('Visual deal board'),
        content:SizedBox(width:920,height:520,child:Column(children:[
          Wrap(spacing:12,children:[
            Chip(label:Text('Open: ${board['openDeals']??0}')),
            Chip(label:Text('Won: ${board['wonDeals']??0}')),
            Chip(label:Text('Closed win rate: ${board['winRateClosedPercent']??'N/A'}%')),
            Chip(label:Text('Overdue follow-ups: ${board['overdueFollowUps']??0}')),
          ]),
          if(data['truncated']==true)const Text('Partial data: only the first 200 deals are displayed.'),
          const SizedBox(height:12),
          Expanded(child:ListView(scrollDirection:Axis.horizontal,children:[
            for(final column in columns)SizedBox(width:230,child:Card(child:Padding(
              padding:const EdgeInsets.all(8),child:Column(children:[
                Text('${column['stage']} (${column['count']})',style:const TextStyle(fontWeight:FontWeight.bold)),
                Text('Value: ${column['amountMinor']} minor units',style:const TextStyle(fontSize:11)),
                const Divider(),
                Expanded(child:ListView(children:[
                  for(final deal in deals)
                    if(deal['stage']==column['stage'])Card(child:ListTile(
                      dense:true,title:Text(deal['title']?.toString()??'Deal'),
                      onTap:() async {
                        final input=await recordForm(dialogContext,'Assign sales owner',['Member user ID','Reason for assignment']);
                        if(input==null)return;
                        try {
                          await widget.store.call('assignCrmDealOwner',{'opportunityId':deal['id'],'ownerUid':input[0].trim(),'reason':input[1].trim()});
                          if(dialogContext.mounted)Navigator.pop(dialogContext);
                        }catch(error){
                          if(dialogContext.mounted)ScaffoldMessenger.of(dialogContext).showSnackBar(SnackBar(content:Text('Assignment failed: $error')));
                        }
                      },
                      subtitle:Text('Probability: ${deal['probability']}%'),
                      trailing:PopupMenuButton<String>(tooltip:'Move deal',
                        onSelected:(stage) async {
                          String reason='';
                          if(stage=='lost'){
                            final input=await recordForm(dialogContext,'Loss explanation',['Reason']);
                            if(input==null||input[0].trim().isEmpty)return;
                            reason=input[0].trim();
                          }
                          try{
                            await widget.store.call('advanceCrmOpportunity',{
                              'opportunityId':deal['id'],'stage':stage,'reason':reason});
                            if(dialogContext.mounted)Navigator.pop(dialogContext);
                          }catch(error){
                            if(dialogContext.mounted)ScaffoldMessenger.of(dialogContext).showSnackBar(
                              SnackBar(content:Text('Move blocked: $error')));
                          }
                        },itemBuilder:(_)=>['discovery','proposal','negotiation','won','lost']
                            .map((v)=>PopupMenuItem(value:v,child:Text(v))).toList()),
                    )),
                ])),
              ]),
            ))),
          ])),
        ])),
        actions:[TextButton(onPressed:()=>Navigator.pop(dialogContext),child:const Text('Close'))],
      ));
    }catch(error){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text('Deal board unavailable: $error')));
    }
  }

  Future<void> pipeline() async {
    try {
      final report=await widget.store.call('getCrmPipeline',{});
      if(!mounted)return;
      final deals=(report['opportunities'] as List?)??[];
      final tasks=(report['followUps'] as List?)??[];
      final summary=(report['summary'] as Map?)??{};
      await showDialog<void>(context:context,builder:(dialogContext)=>AlertDialog(
        title:const Text('Sales pipeline & follow-ups'),
        content:SizedBox(width:700,height:520,child:ListView(children:[
          const Text('Forecast values are estimates, not confirmed sales.'),
          if(report['truncated']==true)const Text('Only the first 200 opportunities and 200 follow-ups are shown.'),
          Wrap(spacing:10,children:[
            for(final entry in summary.entries)
              Chip(label:Text('${entry.key}: ${entry.value['count']} deals')),
          ]),
          const Divider(),
          const Text('OPPORTUNITIES',style:TextStyle(fontWeight:FontWeight.bold)),
          if(deals.isEmpty)const Text('No opportunities recorded.'),
          for(final deal in deals)ListTile(
            title:Text(deal['title']?.toString()??'Opportunity'),
            subtitle:Text('Stage: ${deal['stage']} · Amount (minor units): ${deal['amountMinor']} · Probability: ${deal['probability']}%'),
            trailing:PopupMenuButton<String>(
              tooltip:'Advance deal',
              onSelected:(stage) async {
                String reason='';
                if(stage=='lost'){
                  final input=await recordForm(dialogContext,'Lost opportunity',['Loss reason']);
                  if(input==null||input[0].trim().isEmpty)return;
                  reason=input[0].trim();
                }
                try {
                  await widget.store.call('advanceCrmOpportunity',{
                    'opportunityId':deal['id'],'stage':stage,'reason':reason,
                  });
                  if(dialogContext.mounted)Navigator.pop(dialogContext);
                }catch(error){
                  if(dialogContext.mounted)ScaffoldMessenger.of(dialogContext).showSnackBar(
                    SnackBar(content:Text('Stage update failed: $error')));
                }
              },
              itemBuilder:(_)=>['discovery','proposal','negotiation','won','lost']
                .map((v)=>PopupMenuItem(value:v,child:Text(v))).toList(),
            ),
          ),
          const Divider(),
          const Text('FOLLOW-UPS',style:TextStyle(fontWeight:FontWeight.bold)),
          if(tasks.isEmpty)const Text('No follow-ups scheduled.'),
          for(final task in tasks)ListTile(
            title:Text(task['title']?.toString()??'Follow-up'),
            subtitle:Text('Due: ${task['dueAt']} · ${task['status']}'),
            trailing:task['status']=='open'?TextButton(onPressed:() async {
              try {
                await widget.store.call('completeCrmFollowUp',{'followUpId':task['id']});
                if(dialogContext.mounted)Navigator.pop(dialogContext);
              }catch(error){
                if(dialogContext.mounted)ScaffoldMessenger.of(dialogContext).showSnackBar(
                  SnackBar(content:Text('Completion failed: $error')));
              }
            },child:const Text('Complete')):null,
          ),
        ])),
        actions:[
          TextButton(onPressed:() async {
            final input=await recordForm(dialogContext,'New opportunity',
              ['Title','Contact record ID','Amount in KES','Expected close YYYY-MM-DD','Probability 0–100','Campaign ID (optional)']);
            if(input==null)return;
            final amount=double.tryParse(input[2].trim()),probability=int.tryParse(input[4].trim());
            if(amount==null||!amount.isFinite||probability==null){
              if(dialogContext.mounted)ScaffoldMessenger.of(dialogContext).showSnackBar(
                const SnackBar(content:Text('Enter a valid amount and probability.')));
              return;
            }
            try{
              await widget.store.call('createCrmOpportunity',{
                'title':input[0].trim(),'contactId':input[1].trim(),
                'amountMinor':(amount*100).round(),
                'expectedCloseDate':input[3].trim(),'probability':probability,
                if(input.length>5&&input[5].trim().isNotEmpty)'campaignId':input[5].trim(),
              });
              if(dialogContext.mounted)Navigator.pop(dialogContext);
            }catch(error){
              if(dialogContext.mounted)ScaffoldMessenger.of(dialogContext).showSnackBar(
                SnackBar(content:Text('Opportunity creation failed: $error')));
            }
          },child:const Text('Add opportunity')),
          TextButton(onPressed:() async {
            final input=await recordForm(dialogContext,'Schedule follow-up',
              ['Opportunity ID','Follow-up title','Assigned user ID','Due at UTC YYYY-MM-DDTHH:MM:SSZ']);
            if(input==null)return;
            try{
              await widget.store.call('createCrmFollowUp',{
                'opportunityId':input[0].trim(),'title':input[1].trim(),
                'ownerUid':input[2].trim(),'dueAt':input[3].trim(),
              });
              if(dialogContext.mounted)Navigator.pop(dialogContext);
            }catch(error){
              if(dialogContext.mounted)ScaffoldMessenger.of(dialogContext).showSnackBar(
                SnackBar(content:Text('Follow-up creation failed: $error')));
            }
          },child:const Text('Add follow-up')),
          TextButton(onPressed:()=>Navigator.pop(dialogContext),child:const Text('Close')),
        ],
      ));
    }catch(error){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text('Sales pipeline unavailable: $error')));
    }
  }

  @override Widget build(BuildContext context)=>Scaffold(
    backgroundColor:const Color(0xFFF5F7FB),
    appBar:AppBar(title:const Row(children:[Icon(Icons.people_alt_rounded,color:Color(0xFF2563EB)),SizedBox(width:10),Text('Sales & CRM')]),actions:[TextButton.icon(onPressed:commerceSummary,icon:const Icon(Icons.receipt_long_outlined),label:const Text('Commerce')),TextButton.icon(onPressed:campaignEfficiencyReport,icon:const Icon(Icons.price_check_outlined),label:const Text('Campaign costs')),TextButton.icon(onPressed:campaignReport,icon:const Icon(Icons.campaign_outlined),label:const Text('Campaigns')),TextButton.icon(onPressed:salesCycleReport,icon:const Icon(Icons.timeline_outlined),label:const Text('Sales cycle')),TextButton.icon(onPressed:conversionReport,icon:const Icon(Icons.analytics_outlined),label:const Text('Win/loss')),TextButton.icon(onPressed:agingReport,icon:const Icon(Icons.hourglass_bottom_outlined),label:const Text('Aging')),TextButton.icon(onPressed:quotasAndTerritories,icon:const Icon(Icons.flag_outlined),label:const Text('Quotas')),TextButton.icon(onPressed:teamPerformance,icon:const Icon(Icons.groups_outlined),label:const Text('Team')),TextButton.icon(onPressed:dealBoard,icon:const Icon(Icons.view_kanban_outlined),label:const Text('Deal board')),TextButton.icon(onPressed:salesSequences,icon:const Icon(Icons.auto_awesome_motion_outlined),label:const Text('Sequences')),TextButton.icon(onPressed:leadScores,icon:const Icon(Icons.insights_outlined),label:const Text('Lead scores')),TextButton.icon(onPressed:pipeline,icon:const Icon(Icons.account_tree_outlined),label:const Text('Pipeline'))]),
    floatingActionButton:FloatingActionButton.extended(onPressed:saving?null:addContact,icon:const Icon(Icons.person_add_alt_1_rounded),label:Text(saving?'Saving…':'Add customer')),
    body:StreamBuilder<List<Map<String,dynamic>>>(
      stream:widget.store.watch('contacts'),
      builder:(context,snapshot){
        if(snapshot.connectionState==ConnectionState.waiting&&!snapshot.hasData)return const Center(child:CircularProgressIndicator());
        if(snapshot.hasError)return _StateCard(icon:Icons.cloud_off_rounded,title:'CRM data unavailable',message:snapshot.error.toString());
        final contacts=snapshot.data??const [];
        final normalized=query.trim().toLowerCase();
        final visible=normalized.isEmpty?contacts:contacts.where((c)=>c.values.any((v)=>v.toString().toLowerCase().contains(normalized))).toList();
        final leads=contacts.where((c)=>(c['type']??'Lead').toString().toLowerCase()=='lead').length;
        final customers=contacts.length-leads;
        return ListView(
          padding:const EdgeInsets.fromLTRB(24,24,24,100),
          children:[
            Container(
              padding:const EdgeInsets.all(24),
              decoration:BoxDecoration(
                gradient:const LinearGradient(colors:[Color(0xFF0F172A),Color(0xFF1D4ED8)]),
                borderRadius:BorderRadius.circular(24),
                boxShadow:const [BoxShadow(color:Color(0x220F172A),blurRadius:30,offset:Offset(0,12))],
              ),
              child:Wrap(spacing:28,runSpacing:18,crossAxisAlignment:WrapCrossAlignment.center,children:[
                const SizedBox(width:260,child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                  Text('Customer intelligence at a glance',style:TextStyle(color:Colors.white,fontSize:22,fontWeight:FontWeight.w800)),
                  SizedBox(height:6),
                  Text('Shared customer records, leads and follow-up context across the workspace.',style:TextStyle(color:Color(0xFFBFDBFE),height:1.4)),
                ])),
                _Metric(label:'Total contacts',value:contacts.length.toString(),icon:Icons.groups_rounded),
                _Metric(label:'Leads',value:leads.toString(),icon:Icons.track_changes_rounded),
                _Metric(label:'Customers',value:customers.toString(),icon:Icons.handshake_rounded),
              ]),
            ),
            const SizedBox(height:20),
            TextField(
              decoration:const InputDecoration(prefixIcon:Icon(Icons.search_rounded),hintText:'Search name, email, phone or location'),
              onChanged:(v)=>setState(()=>query=v),
            ),
            const SizedBox(height:16),
            if(contacts.isEmpty)
              const _StateCard(icon:Icons.people_outline_rounded,title:'No contacts yet',message:'Add your first lead or customer to start building the shared CRM.')
            else if(visible.isEmpty)
              const _StateCard(icon:Icons.search_off_rounded,title:'No matching contacts',message:'Try a broader search term.')
            else
              LayoutBuilder(builder:(context,constraints){
                final wide=constraints.maxWidth>900;
                if(!wide)return Column(children:[for(final c in visible)...[_ContactCard(contact:c,onTimeline:()=>contactTimeline(c),onPreferences:()=>contactPreferences(c)),const SizedBox(height:10)]]);
                return Wrap(spacing:12,runSpacing:12,children:[for(final c in visible)SizedBox(width:(constraints.maxWidth-12)/2,child:_ContactCard(contact:c,onTimeline:()=>contactTimeline(c),onPreferences:()=>contactPreferences(c)))]);
              }),
          ],
        );
      },
    ),
  );
}

class _Metric extends StatelessWidget{
  final String label,value;final IconData icon;
  const _Metric({required this.label,required this.value,required this.icon});
  @override Widget build(BuildContext context)=>Container(
    padding:const EdgeInsets.symmetric(horizontal:16,vertical:14),
    decoration:BoxDecoration(color:Colors.white.withValues(alpha:.09),borderRadius:BorderRadius.circular(16),border:Border.all(color:Colors.white.withValues(alpha:.12))),
    child:Row(mainAxisSize:MainAxisSize.min,children:[Icon(icon,color:Colors.white),const SizedBox(width:10),Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(value,style:const TextStyle(color:Colors.white,fontWeight:FontWeight.w800,fontSize:20)),Text(label,style:const TextStyle(color:Color(0xFFDBEAFE),fontSize:12))])]),
  );
}

class _ContactCard extends StatelessWidget{
  final Map<String,dynamic> contact;
  final VoidCallback onTimeline,onPreferences;
  const _ContactCard({required this.contact,required this.onTimeline,required this.onPreferences});
  @override Widget build(BuildContext context){
    final name=(contact['name']??'Unnamed contact').toString().trim();
    final safeName=name.isEmpty?'Unnamed contact':name;
    final email=(contact['email']??'').toString().trim();
    final phone=(contact['phone']??'').toString().trim();
    final location=(contact['location']??'').toString().trim();
    final type=(contact['type']??'Lead').toString();
    return Container(
      padding:const EdgeInsets.all(18),
      decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(18),border:Border.all(color:const Color(0xFFE5E7EB)),boxShadow:const [BoxShadow(color:Color(0x0D0F172A),blurRadius:18,offset:Offset(0,6))]),
      child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
        CircleAvatar(backgroundColor:const Color(0xFFDBEAFE),child:Text(safeName[0].toUpperCase(),style:const TextStyle(color:Color(0xFF1D4ED8),fontWeight:FontWeight.w800))),
        const SizedBox(width:14),
        Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Row(children:[Expanded(child:Text(safeName,style:const TextStyle(fontWeight:FontWeight.w800,fontSize:16))),Chip(label:Text(type))]),
          if(email.isNotEmpty)Text(email,overflow:TextOverflow.ellipsis),
          const SizedBox(height:4),
          Wrap(spacing:12,runSpacing:4,children:[
            if(phone.isNotEmpty)Text(phone,style:const TextStyle(color:Color(0xFF64748B))),
            if(location.isNotEmpty)Text(location,style:const TextStyle(color:Color(0xFF64748B))),
            TextButton.icon(onPressed:onTimeline,icon:const Icon(Icons.history_rounded,size:16),label:const Text('Activity timeline')),
            TextButton.icon(onPressed:onPreferences,icon:const Icon(Icons.do_not_disturb_on_outlined,size:16),label:const Text('Outreach preferences')),
          ]),
        ])),
      ]),
    );
  }
}

class _StateCard extends StatelessWidget{
  final IconData icon;final String title,message;
  const _StateCard({required this.icon,required this.title,required this.message});
  @override Widget build(BuildContext context)=>Center(child:Container(
    constraints:const BoxConstraints(maxWidth:560),padding:const EdgeInsets.all(28),
    decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(20),border:Border.all(color:const Color(0xFFE5E7EB))),
    child:Column(mainAxisSize:MainAxisSize.min,children:[Icon(icon,size:44,color:const Color(0xFF64748B)),const SizedBox(height:12),Text(title,style:const TextStyle(fontWeight:FontWeight.w800,fontSize:18)),const SizedBox(height:6),Text(message,textAlign:TextAlign.center,style:const TextStyle(color:Color(0xFF64748B)))]),
  ));
}
