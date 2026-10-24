import 'dart:convert';
import 'package:flutter/material.dart';
import '../suite.dart';

class CloudAutomationScreen extends StatefulWidget {
  final SuiteStore store;
  const CloudAutomationScreen({super.key,required this.store});
  @override
  State<CloudAutomationScreen> createState()=>_CloudAutomationScreenState();
}
class _CloudAutomationScreenState extends State<CloudAutomationScreen>{
  final jsonInput=TextEditingController();
  bool busy=false;
  String message='';
  List<Map<String,dynamic>> plans=[];
  List<Map<String,dynamic>> jobs=[];
  @override
  void initState(){super.initState();if(!widget.store.demo) refresh();}
  @override
  void dispose(){jsonInput.dispose();super.dispose();}
  Future<void> refresh()async{
    try{
      final result=await widget.store.call('cloudListMigrationPlans');
      final operations=await widget.store.call('cloudListOperations');
      if(mounted)setState((){
        plans=(result['plans'] as List? ?? []).map((e)=>Map<String,dynamic>.from(e as Map)).toList();
        jobs=(operations['jobs'] as List? ?? []).map((e)=>Map<String,dynamic>.from(e as Map)).toList();
      });
    }catch(e){if(mounted)setState(()=>message='Unable to load plans: $e');}
  }
  Future<void> importPlan()async{
    if(busy)return;
    setState((){busy=true;message='';});
    try{
      if(widget.store.demo)throw StateError('Sign in to a real workspace to import plans.');
      final plan=jsonDecode(jsonInput.text);
      if(plan is! Map<String,dynamic>)throw FormatException('Expected a JSON object');
      final result=await widget.store.call('cloudImportMigrationPlan',{'plan':plan});
      if(mounted)setState(()=>message='Imported plan ${result['id']}. Awaiting review; no resources deployed.');
      await refresh();
    }catch(e){if(mounted)setState(()=>message='Import failed: $e');}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> previewPlan(String id)async{
    try{
      final result=await widget.store.call('cloudPreviewPlan',{'planId':id});
      if(mounted)showDialog<void>(context:context,builder:(context)=>AlertDialog(
        title:const Text('Cloud deployment preview — no changes made'),
        content:SizedBox(width:600,child:SingleChildScrollView(child:SelectableText(
          const JsonEncoder.withIndent('  ').convert(result['blueprint'])))),
        actions:[TextButton(onPressed:()=>Navigator.pop(context),child:const Text('Close'))]));
    }catch(e){if(mounted)setState(()=>message='Preview unavailable: $e');}
  }
  Future<void> createOperation(String planId)async{
    if(busy)return;
    setState(()=>busy=true);
    try{
      await widget.store.call('cloudCreateOperation',{'planId':planId,'kind':'deployment',
        'reason':'Customer requested a scoped cloud deployment review'});
      if(mounted)setState(()=>message='Deployment request created; no cloud resources changed.');
      await refresh();
    }catch(e){if(mounted)setState(()=>message='Cannot create request: $e');}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> advanceJob(String jobId,String decision)async{
    if(busy)return;
    setState(()=>busy=true);
    try{
      await widget.store.call('cloudAdvanceOperation',{'jobId':jobId,'decision':decision});
      await refresh();
    }catch(e){if(mounted)setState(()=>message='Cannot advance job: $e');}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> review(String id,String decision)async{
    if(busy)return;
    setState(()=>busy=true);
    try{
      await widget.store.call('cloudReviewMigrationPlan',{'planId':id,'decision':decision});
      if(mounted)setState(()=>message='Review saved. Live deployment remains disabled.');
      await refresh();
    }catch(e){if(mounted)setState(()=>message='Review failed: $e');}
    finally{if(mounted)setState(()=>busy=false);}
  }
  @override
  Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Cloud Automation & Migration')),
    body:ListView(padding:const EdgeInsets.all(20),children:[
      const Text('Import an HTML deployment plan',style:TextStyle(fontSize:22,fontWeight:FontWeight.bold)),
      const SizedBox(height:8),
      const Text('Paste the JSON exported from TeknTandao HTML. Plans are scoped to your current workspace and require owner review. This feature does not deploy cloud resources.'),
      const SizedBox(height:16),
      TextField(controller:jsonInput,maxLines:8,decoration:const InputDecoration(labelText:'Migration request JSON',border:OutlineInputBorder())),
      const SizedBox(height:12),
      FilledButton(onPressed:busy?null:importPlan,child:const Text('Import into Workspace')),
      if(message.isNotEmpty)Padding(padding:const EdgeInsets.all(12),child:SelectableText(message)),
      const Divider(height:32),
      Row(children:[const Expanded(child:Text('Migration plans',style:TextStyle(fontSize:22,fontWeight:FontWeight.bold))),IconButton(onPressed:refresh,icon:const Icon(Icons.refresh))]),
      ...plans.map((plan)=>Card(child:Padding(padding:const EdgeInsets.all(14),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(plan['appName']?.toString()??'Application',style:const TextStyle(fontWeight:FontWeight.bold)),
        Text('${plan['provider']} · ${plan['stack']} · USD ${plan['monthlyBudgetUsd']}/month requested'),
        Text('Status: ${plan['state']} · execution disabled'),
        OutlinedButton(onPressed:busy?null:()=>previewPlan(plan['id'].toString()),
          child:const Text('View cloud blueprint')),
        if(plan['state']=='approved_for_manual_setup')
          OutlinedButton(onPressed:busy?null:()=>createOperation(plan['id'].toString()),child:const Text('Request deployment review')),
        if(plan['state']=='awaiting_review')Wrap(spacing:10,children:[
          OutlinedButton(onPressed:busy?null:()=>review(plan['id'].toString(),'reject'),child:const Text('Reject')),
          FilledButton(onPressed:busy?null:()=>review(plan['id'].toString(),'approve'),child:const Text('Approve planning record'))
        ])
      ])))),
      const Divider(height:32),
      const Text('Operations approval queue',style:TextStyle(fontSize:22,fontWeight:FontWeight.bold)),
      const Text('Operator approval and live execution remain disabled pending verified platform credentials.'),
      ...jobs.map((job)=>Card(child:ListTile(
        title:Text('${job['kind']} — ${job['state']}'),
        subtitle:Text(job['reason']?.toString()??''),
        trailing:job['state']=='proposed'
          ?TextButton(onPressed:busy?null:()=>advanceJob(job['id'].toString(),'validate'),child:const Text('Validate'))
          :job['state']=='validated'
          ?TextButton(onPressed:busy?null:()=>advanceJob(job['id'].toString(),'request_customer'),child:const Text('Request approval'))
          :job['state']=='awaiting_customer'
          ?TextButton(onPressed:busy?null:()=>advanceJob(job['id'].toString(),'approve_customer'),child:const Text('Customer approve'))
          :null,
      ))),
    ]),
  );
}
