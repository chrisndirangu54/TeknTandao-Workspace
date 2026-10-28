import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';

/// Separate operating contexts; switching modes does not copy or merge records.
class IspProductConsole extends StatefulWidget{
 const IspProductConsole({super.key,this.workspaceId,this.initialMode});
 final String? workspaceId;
 final String? initialMode;
 @override State<IspProductConsole> createState()=>_IspProductConsoleState();
}
class _IspProductConsoleState extends State<IspProductConsole>{
 late final TextEditingController orgId;
 String mode='operator',kind='subscribers';
 bool loading=false;
 String? error;
 Map<String,dynamic>? overview;
 List<Map<String,dynamic>> records=[];
 String? nextCursor;
 bool hasMore=false;
 @override void initState(){super.initState();orgId=TextEditingController(text:widget.workspaceId??'');mode=widget.initialMode??(widget.workspaceId!=null?'managed':'operator');}
 FirebaseFunctions get functions=>FirebaseFunctions.instanceFor(region:'europe-west1');
 Future<void> refresh()async{
  if(loading)return;
  setState(()=>loading=true);
  try{
   final base={'mode':mode,if(mode=='managed')'orgId':orgId.text.trim()};
   final first=await functions.httpsCallable('getIspWorkspaceOverview').call(base);
   final second=await functions.httpsCallable('listIspWorkspaceRecords').call({...base,'kind':kind,'pageSize':50});
   if(mounted)setState((){
    overview=Map<String,dynamic>.from(first.data as Map);
    nextCursor=second.data['nextCursor']?.toString();
    hasMore=second.data['hasMore']==true;
    records=(second.data['records'] as List? ?? const []).whereType<Map>()
     .map((x)=>Map<String,dynamic>.from(x)).toList();
    error=null;
   });
  }catch(e){if(mounted)setState(()=>error=e.toString());}
  finally{if(mounted)setState(()=>loading=false);}
 }
 Future<void> loadMore()async{
  if(loading||!hasMore||nextCursor==null)return;
  setState(()=>loading=true);
  try{
   final response=await functions.httpsCallable('listIspWorkspaceRecords').call({
    'mode':mode,if(mode=='managed')'orgId':orgId.text.trim(),
    'kind':kind,'pageSize':50,'afterId':nextCursor});
   if(!mounted)return;
   setState((){
    records.addAll((response.data['records'] as List? ?? const []).whereType<Map>()
      .map((x)=>Map<String,dynamic>.from(x)));
    nextCursor=response.data['nextCursor']?.toString();
    hasMore=response.data['hasMore']==true;
   });
  }catch(e){if(mounted)setState(()=>error=e.toString());}
  finally{if(mounted)setState(()=>loading=false);}
 }
 Future<void> addRecord()async{
  final label=TextEditingController(),notes=TextEditingController();
  try{
   final approved=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(
    title:Text('New $kind record'),content:Column(mainAxisSize:MainAxisSize.min,children:[
     TextField(controller:label,maxLength:120,decoration:const InputDecoration(labelText:'Label')),
     TextField(controller:notes,maxLength:1000,decoration:const InputDecoration(labelText:'Notes')),
    ]),actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancel')),
     FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Create'))]));
   if(approved!=true||!mounted)return;
   if(label.text.trim().isEmpty)throw StateError('A label is required');
   setState(()=>loading=true);
   await functions.httpsCallable('saveIspWorkspaceRecord').call({
    'mode':mode,if(mode=='managed')'orgId':orgId.text.trim(),'kind':kind,
    'id':'isp_${DateTime.now().microsecondsSinceEpoch}',
    'record':{'label':label.text.trim(),'status':'planned','notes':notes.text.trim()}});
  }catch(e){if(mounted)setState(()=>error=e.toString());}
  finally{label.dispose();notes.dispose();if(mounted){setState(()=>loading=false);await refresh();}}
 }
 @override void dispose(){orgId.dispose();super.dispose();}
 @override Widget build(BuildContext context)=>Scaffold(
  appBar:AppBar(title:const Text('ISP Products')),
  body:ListView(padding:const EdgeInsets.all(20),children:[
   const Text('Choose the ISP business you are operating',style:TextStyle(fontSize:21,fontWeight:FontWeight.bold)),
   const SizedBox(height:12),
   SegmentedButton<String>(segments:const [
    ButtonSegment(value:'managed',label:Text('Third-party ISP Management'),icon:Icon(Icons.apartment)),
    ButtonSegment(value:'operator',label:Text('TeknTandao ISP'),icon:Icon(Icons.router))
   ],selected:{mode},onSelectionChanged:widget.workspaceId!=null?null:(v)=>setState((){
    mode=v.first;overview=null;records.clear();
   })),
   const SizedBox(height:12),
   Text(mode=='managed'?'Manage an ISP customer organization. Every workspace is isolated from other ISPs.':
    'Operate TeknTandao-owned subscribers and infrastructure. Platform administrators only.'),
   if(mode=='managed'&&widget.workspaceId==null)TextField(controller:orgId,decoration:const InputDecoration(
    labelText:'Third-party ISP organization ID',border:OutlineInputBorder())),
   const SizedBox(height:12),
   DropdownButton<String>(value:kind,items:const [
    DropdownMenuItem(value:'subscribers',child:Text('Subscribers')),
    DropdownMenuItem(value:'devices',child:Text('Devices')),
    DropdownMenuItem(value:'sites',child:Text('Sites')),
    DropdownMenuItem(value:'plans',child:Text('Plans')),
    DropdownMenuItem(value:'incidents',child:Text('Incidents')),
   ],onChanged:(v)=>setState(()=>kind=v??kind)),
   FilledButton.icon(onPressed:loading?null:refresh,icon:const Icon(Icons.refresh),
    label:const Text('Open selected ISP')),
   if(loading)const LinearProgressIndicator(),
   if(overview!=null)OutlinedButton.icon(onPressed:loading?null:addRecord,
    icon:const Icon(Icons.add),label:Text('Add $kind record')),
   if(error!=null)Text(error!,style:TextStyle(color:Theme.of(context).colorScheme.error)),
   if(overview!=null)...[
    Text('Product: ${overview!['product']}'),
    const Text('Management records only. Router provisioning, live telemetry and billing are not yet connected.'),
    for(final entry in (overview!['stats'] as Map? ?? {}).entries)
     ListTile(title:Text(entry.key.toString()),subtitle:Text(entry.value.toString())),
    const Divider(),
    for(final record in records)
     ListTile(title:Text(record['label']?.toString()??record['id']?.toString()??'Record'),
      subtitle:Text('${record['status']??'Unknown'}')),
    if(hasMore)TextButton(onPressed:loading?null:loadMore,child:const Text('Load more records')),
   ],
  ])
 );
}
