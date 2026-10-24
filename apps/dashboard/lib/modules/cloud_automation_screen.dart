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
  @override
  void initState(){super.initState();if(!widget.store.demo) refresh();}
  @override
  void dispose(){jsonInput.dispose();super.dispose();}
  Future<void> refresh()async{
    try{
      final result=await widget.store.call('cloudListMigrationPlans');
      if(mounted)setState(()=>plans=(result['plans'] as List? ?? []).map((e)=>Map<String,dynamic>.from(e as Map)).toList());
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
        if(plan['state']=='awaiting_review')Wrap(spacing:10,children:[
          OutlinedButton(onPressed:busy?null:()=>review(plan['id'].toString(),'reject'),child:const Text('Reject')),
          FilledButton(onPressed:busy?null:()=>review(plan['id'].toString(),'approve'),child:const Text('Approve planning record'))
        ])
      ])))),
    ]),
  );
}
