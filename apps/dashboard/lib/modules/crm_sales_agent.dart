import 'package:flutter/material.dart';
import '../suite.dart';

/// Read-only CRM analysis with explicit user-controlled follow-up creation.
class CrmSalesAgentScreen extends StatefulWidget {
  final SuiteStore store;
  const CrmSalesAgentScreen({super.key,required this.store});
  @override State<CrmSalesAgentScreen> createState()=>_CrmSalesAgentScreenState();
}
class _CrmSalesAgentScreenState extends State<CrmSalesAgentScreen> {
  final prompt=TextEditingController(text:'Which deals need immediate follow-up?');
  final List<Map<String,dynamic>> rows=[];
  String? cursor;
  bool busy=false,more=true;
  String? error,summary;
  @override void initState(){super.initState();load();}
  @override void dispose(){prompt.dispose();super.dispose();}
  Future<void> load() async {
    if(busy||!more)return;
    setState(()=>busy=true);
    try {
      final result=await widget.store.call('getCrmSalesAgentPage',{
        'pageSize':20,'limit':25,if(cursor!=null)'afterId':cursor,
      });
      if(!mounted)return;
      setState((){
        rows.addAll((result['recommendations'] as List? ?? const [])
          .whereType<Map>().map((e)=>Map<String,dynamic>.from(e)));
        cursor=result['nextCursor']?.toString();
        more=result['hasMore']==true;
        error=null;
      });
    }catch(e){if(mounted)setState(()=>error=e.toString());}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> explain() async {
    if(busy)return;
    final ids=rows.take(10).map((r)=>r['opportunityId']?.toString()??'')
      .where((id)=>id.isNotEmpty).toList();
    if(ids.isEmpty)return;
    setState(()=>busy=true);
    try {
      final response=await widget.store.call('explainCrmSalesRecommendations',{
        'opportunityIds':ids,'prompt':prompt.text.trim().isEmpty?
         'Recommend the highest priority next steps':prompt.text.trim(),
      });
      if(mounted)setState(()=>summary=response['summary']?.toString());
    }catch(e){if(mounted)setState(()=>error=e.toString());}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> proposeFollowUp(Map<String,dynamic> recommendation) async {
    final opportunityId=recommendation['opportunityId']?.toString()??'';
    final owner=recommendation['ownerUid']?.toString()??'';
    if(opportunityId.isEmpty||owner.isEmpty){
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content:Text('Assign an opportunity owner before creating a follow-up.')));
      return;
    }
    final title='Review: ${recommendation['title']??'sales opportunity'}';
    final due=DateTime.now().toUtc().add(const Duration(days:1))
      .toIso8601String().split('.').first+'Z';
    final approved=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(
      title:const Text('Approve CRM follow-up'),
      content:Text('Create an internal follow-up for the assigned owner?\n\n'
        'Opportunity: ${recommendation['title']}\nTask: $title\nDue (UTC): $due\n\n'
        'No email, WhatsApp message, or customer notification will be sent.'),
      actions:[
        TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancel')),
        FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Create task')),
      ],
    ));
    if(approved!=true||!mounted)return;
    setState(()=>busy=true);
    try {
      await widget.store.call('createCrmFollowUp',{
        'opportunityId':opportunityId,'title':title,'ownerUid':owner,'dueAt':due,
      });
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content:Text('Internal follow-up created.')));
    }catch(e){if(mounted)setState(()=>error=e.toString());}
    finally{if(mounted)setState(()=>busy=false);}
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('CRM Sales Agent')),
    body:ListView(padding:const EdgeInsets.all(20),children:[
      const Text('Review-only AI sales assistant',style:TextStyle(fontSize:22,fontWeight:FontWeight.bold)),
      const SizedBox(height:6),
      const Text('Pipeline signals are computed from CRM records. AI explanations are advisory. Customer outreach is never automatic.'),
      const SizedBox(height:16),
      TextField(controller:prompt,maxLines:2,maxLength:1000,
        decoration:const InputDecoration(labelText:'Ask about the selected deals',border:OutlineInputBorder())),
      Wrap(spacing:12,children:[
        FilledButton.icon(onPressed:busy||rows.isEmpty?null:explain,
          icon:const Icon(Icons.auto_awesome),label:const Text('Explain with AI')),
        OutlinedButton.icon(onPressed:busy?null:(){
          setState((){rows.clear();cursor=null;more=true;summary=null;});load();
        },icon:const Icon(Icons.refresh),label:const Text('Refresh')),
      ]),
      if(error!=null)Padding(padding:const EdgeInsets.symmetric(vertical:12),
        child:Text(error!,style:TextStyle(color:Theme.of(context).colorScheme.error))),
      if(summary!=null)Card(child:Padding(padding:const EdgeInsets.all(16),
        child:SelectableText(summary!))),
      const SizedBox(height:16),
      for(final row in rows)Card(child:ListTile(
        title:Text(row['title']?.toString()??'Opportunity'),
        subtitle:Text('Priority: ${row['priority']} · ${(row['reasons'] as List? ?? []).join(', ')}\n'
          '${row['suggestion']??''}'),
        isThreeLine:true,
        trailing:TextButton(onPressed:busy?null:()=>proposeFollowUp(row),
          child:const Text('Review task')),
      )),
      if(busy)const Center(child:Padding(padding:EdgeInsets.all(20),
        child:CircularProgressIndicator())),
      if(more)Center(child:OutlinedButton(
        onPressed:busy?null:load,child:const Text('Load next page'))),
      if(!more&&rows.isEmpty)const Text('No opportunities currently require attention.'),
      if(!more&&rows.isNotEmpty)const Text('End of pipeline pages.'),
    ]),
  );
}
