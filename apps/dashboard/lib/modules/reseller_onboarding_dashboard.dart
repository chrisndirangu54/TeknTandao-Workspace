import 'package:flutter/material.dart';
import '../suite.dart';

class ResellerOnboardingDashboard extends StatefulWidget {
  final SuiteStore store;
  const ResellerOnboardingDashboard({super.key,required this.store});
  @override State<ResellerOnboardingDashboard> createState()=>_ResellerOnboardingDashboardState();
}
class _ResellerOnboardingDashboardState extends State<ResellerOnboardingDashboard> {
 Map<String,dynamic> data={};
 bool busy=false;
 String? error;
 @override void initState(){super.initState();load();}
 Future<void> load()async {
  if(widget.store.demo)return;
  try{
   final result=await widget.store.call('getResellerOnboardingDashboard');
   if(mounted)setState(()=>data=result);
  }catch(e){if(mounted)setState(()=>error=e.toString());}
 }
 Future<void> create()async{
  final fields={'company':'Company','contactEmail':'Email','program':'Program: microsoft, google, aws, td_africa, other','notes':'Notes'};
  final controllers=fields.map((k,v)=>MapEntry(k,TextEditingController()));
  try{
   final ok=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(
    title:const Text('New reseller application'),
    content:SizedBox(width:480,child:SingleChildScrollView(child:Column(mainAxisSize:MainAxisSize.min,
     children:fields.entries.map((e)=>Padding(padding:const EdgeInsets.only(bottom:12),
      child:TextField(controller:controllers[e.key],decoration:InputDecoration(labelText:e.value)))).toList()))),
    actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancel')),
     FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Save application'))]));
   if(ok!=true)return;
   setState(()=>busy=true);
   await widget.store.call('createResellerOnboarding',{'record':{
    'company':controllers['company']!.text.trim(),
    'contactEmail':controllers['contactEmail']!.text.trim(),
    'program':controllers['program']!.text.trim().toLowerCase(),
    'notes':controllers['notes']!.text.trim()
   }});
   await load();
  }catch(e){if(mounted)setState(()=>error=e.toString());}
  finally{if(mounted)setState(()=>busy=false);for(final c in controllers.values){c.dispose();}}
 }
 Future<void> change(String id,String stage)async{
  try{setState(()=>busy=true);await widget.store.call('updateResellerOnboardingStage',{'id':id,'stage':stage});await load();}
  catch(e){if(mounted)setState(()=>error=e.toString());}
  finally{if(mounted)setState(()=>busy=false);}
 }
 @override Widget build(BuildContext context){
  final records=(data['records'] as List? ?? []).whereType<Map>().map((m)=>Map<String,dynamic>.from(m)).toList();
  final stages=Map<String,dynamic>.from(data['stages'] as Map? ?? {});
  return Scaffold(appBar:AppBar(title:const Text('Reseller onboarding and automation'),actions:[
   IconButton(onPressed:busy?null:load,icon:const Icon(Icons.refresh)),
  ]),body:ListView(padding:const EdgeInsets.all(18),children:[
   Wrap(spacing:12,runSpacing:12,children:[
    for(final e in stages.entries)Chip(label:Text('${e.key}: ${e.value}')),
    FilledButton.icon(onPressed:busy?null:create,icon:const Icon(Icons.person_add_alt_1),label:const Text('Add application'))
   ]),
   const SizedBox(height:16),
   const Text('Dynamics 365 synchronization is not yet enabled. Connect your Dataverse account in Automation Studio; these onboarding records stay internal until authorized synchronization is configured.'),
   if(error!=null)Padding(padding:const EdgeInsets.all(12),child:Text(error!,style:TextStyle(color:Theme.of(context).colorScheme.error))),
   if(records.isEmpty)const Padding(padding:EdgeInsets.all(20),child:Text('No applications yet.')),
   for(final record in records)Card(child:ListTile(
    title:Text('${record['company'] ?? ''} · ${record['program'] ?? ''}'),
    subtitle:Text('${record['contactEmail'] ?? ''}\nStage: ${record['stage'] ?? ''}\n${record['notes'] ?? ''}'),
    isThreeLine:true,
    trailing:PopupMenuButton<String>(
     enabled:!busy,
     tooltip:'Update onboarding stage',
     onSelected:(stage)=>change(record['id'].toString(),stage),
     itemBuilder:(_)=>['lead','qualification','application','verification','approved','provisioning','active','blocked'].map(
      (stage)=>PopupMenuItem(value:stage,child:Text(stage))).toList(),
    ),
   )),
  ]));
 }
}
