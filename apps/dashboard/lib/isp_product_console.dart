import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';

/// Separate operating contexts; switching modes does not copy or merge records.
class IspProductConsole extends StatefulWidget{
 const IspProductConsole({super.key});
 @override State<IspProductConsole> createState()=>_IspProductConsoleState();
}
class _IspProductConsoleState extends State<IspProductConsole>{
 final orgId=TextEditingController();
 String mode='operator',kind='subscribers';
 bool loading=false;
 String? error;
 Map<String,dynamic>? overview;
 List<Map<String,dynamic>> records=[];
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
    records=(second.data['records'] as List? ?? const []).whereType<Map>()
     .map((x)=>Map<String,dynamic>.from(x)).toList();
    error=null;
   });
  }catch(e){if(mounted)setState(()=>error=e.toString());}
  finally{if(mounted)setState(()=>loading=false);}
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
   ],selected:{mode},onSelectionChanged:(v)=>setState((){
    mode=v.first;overview=null;records.clear();
   })),
   const SizedBox(height:12),
   Text(mode=='managed'?'Manage an ISP customer organization. Every workspace is isolated from other ISPs.':
    'Operate TeknTandao-owned subscribers and infrastructure. Platform administrators only.'),
   if(mode=='managed')TextField(controller:orgId,decoration:const InputDecoration(
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
   ],
  ])
 );
}
