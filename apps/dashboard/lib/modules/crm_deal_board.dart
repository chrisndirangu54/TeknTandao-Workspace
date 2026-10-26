import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

const _stages=['qualification','discovery','proposal','negotiation','won','lost'];
const _transitions={
 'qualification':['discovery','lost'],
 'discovery':['proposal','lost'],
 'proposal':['negotiation','won','lost'],
 'negotiation':['won','lost'],
 'won':<String>[],
 'lost':<String>[],
};

class CrmDealBoardScreen extends StatefulWidget {
 final SuiteStore store;
 const CrmDealBoardScreen({super.key,required this.store});
 @override State<CrmDealBoardScreen> createState()=>_CrmDealBoardScreenState();
}
class _CrmDealBoardScreenState extends State<CrmDealBoardScreen> {
 final List<Map<String,dynamic>> deals=[];
 String? cursor;
 bool loading=false,hasMore=true;
 String? error;
 @override void initState(){super.initState();load();}
 Future<void> load() async {
  if(loading||!hasMore)return;
  setState(()=>loading=true);
  try{
   final response=await widget.store.call('getCrmPipelinePage',{
    'pageSize':50,if(cursor!=null)'afterId':cursor});
   if(!mounted)return;
   final page=(response['opportunities'] as List? ?? [])
     .map((x)=>Map<String,dynamic>.from(x as Map)).toList();
   setState((){
    deals.addAll(page);cursor=response['nextCursor']?.toString();
    hasMore=response['hasMore']==true;error=null;
   });
  }catch(e){if(mounted)setState(()=>error=e.toString());}
  finally{if(mounted)setState(()=>loading=false);}
 }
 Future<void> move(Map<String,dynamic> deal,String stage) async{
  String reason='';
  if(stage=='lost'){
   final v=await recordForm(context,'Lost deal',['Loss reason']);
   if(v==null||v.isEmpty||v[0].trim().isEmpty)return;
   reason=v[0].trim();
  }
  try{
   await widget.store.call('advanceCrmOpportunity',{
    'opportunityId':deal['id'],'stage':stage,'reason':reason});
   if(!mounted)return;
   setState(()=>deal['stage']=stage);
  }catch(e){
   if(mounted)ScaffoldMessenger.of(context).showSnackBar(
     SnackBar(content:Text('Stage change denied: $e')));
  }
 }
 Future<void> assign(Map<String,dynamic> deal) async{
  final v=await recordForm(context,'Assign owner',['Workspace member ID','Reason']);
  if(v==null||v.length<2)return;
  try{
   await widget.store.call('assignCrmDealOwner',{
    'opportunityId':deal['id'],'ownerUid':v[0].trim(),'reason':v[1].trim()});
   if(mounted)setState(()=>deal['ownerUid']=v[0].trim());
  }catch(e){
   if(mounted)ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content:Text('Assignment denied: $e')));
  }
 }
 @override Widget build(BuildContext context)=>Scaffold(
  appBar:AppBar(title:const Text('CRM deal board')),
  body:Column(children:[
   Padding(padding:const EdgeInsets.all(12),child:Row(children:[
    Text('Loaded ${deals.length} opportunities'),
    const Spacer(),
    if(loading)const SizedBox(width:20,height:20,child:CircularProgressIndicator(strokeWidth:2)),
    if(hasMore)TextButton(onPressed:loading?null:load,child:const Text('Load more')),
   ])),
   if(error!=null)Padding(padding:const EdgeInsets.all(8),
     child:Text(error!,style:const TextStyle(color:Colors.red))),
   Expanded(child:ListView(scrollDirection:Axis.horizontal,children:[
    for(final stage in _stages)SizedBox(width:275,child:Card(child:Column(children:[
     Padding(padding:const EdgeInsets.all(12),child:Text(
      '${stage.toUpperCase()} (${deals.where((d)=>d['stage']==stage).length})',
      style:const TextStyle(fontWeight:FontWeight.bold))),
     Expanded(child:ListView(children:[
      for(final deal in deals.where((d)=>d['stage']==stage))
       Card(child:Padding(padding:const EdgeInsets.all(8),child:Column(
        crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(deal['title']?.toString()??'Untitled',style:const TextStyle(fontWeight:FontWeight.bold)),
        Text('Owner: ${deal['ownerUid']??deal['createdBy']??'Unknown'}'),
        Text('Value: ${deal['amountMinor']} minor units'),
        Row(children:[
         TextButton(onPressed:()=>assign(deal),child:const Text('Assign')),
         if((_transitions[stage]??[]).isNotEmpty)
          PopupMenuButton<String>(
           tooltip:'Move to allowed stage',
           onSelected:(value)=>move(deal,value),
           itemBuilder:(_)=>_transitions[stage]!
            .map((next)=>PopupMenuItem(value:next,child:Text(next))).toList()),
        ]),
       ]))),
     ])),
    ]))),
   ])),
  ]),
 );
}
