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
 Future<void> addConfiguredRecord() async {
  const fields=<String,List<String>>{
   'plans':['id','label','downloadKbps','uploadKbps','priceMinorKes','activationMode','vlanId'],
   'sites':['id','label','siteCode','area'],
   'devices':['id','label','vendor','model','siteId','driver','managementProfileId'],
   'subscribers':['accountCode','label','planId','siteId','deviceId','accessMode'],
  };
  final requested=fields[kind];
  if(requested==null)return;
  final controllers={for(final name in requested)name:TextEditingController()};
  try{
   final approved=await showDialog<bool>(
    context:context,builder:(ctx)=>AlertDialog(
     title:Text('Configure $kind'),
     content:SizedBox(width:440,child:SingleChildScrollView(child:Column(
      mainAxisSize:MainAxisSize.min,
      children:[for(final name in requested)Padding(
       padding:const EdgeInsets.only(bottom:8),
       child:TextField(
        controller:controllers[name],
        keyboardType:const ['downloadKbps','uploadKbps','priceMinorKes','vlanId'].contains(name)
         ?TextInputType.number:TextInputType.text,
        decoration:InputDecoration(labelText:name,helperText:switch(name){
         'priceMinorKes'=>'Price in KES cents (e.g. 250000 = KSh 2,500)',
         'activationMode'=>'pppoe, dhcp or hotspot',
         'driver'=>'routeros_rest, unifi_api, snmpv3, netconf, tr069 or other',
         'vendor'=>'mikrotik, ubiquiti, huawei, zte, cisco or other',
         'accessMode'=>'fiber, wireless or ethernet',
         _=>null,
        }),
       ),
      )],
     ))),
     actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancel')),
      FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Save configuration'))],
    ));
   if(approved!=true||!mounted)return;
   final record=<String,dynamic>{};
   for(final name in requested){
    if(name=='id')continue;
    final value=controllers[name]!.text.trim();
    if(value.isEmpty)continue;
    if(const ['downloadKbps','uploadKbps','priceMinorKes','vlanId'].contains(name)){
     final n=int.tryParse(value);
     if(n==null)throw FormatException('$name must be a whole number');
     record[name]=n;
    }else{record[name]=value;}
   }
   final id=(controllers['id']?.text.trim()??controllers['accountCode']?.text.trim()??'');
   if(id.isEmpty)throw const FormatException('Record ID is required');
   setState(()=>loading=true);
   await functions.httpsCallable('createIspConfigurationRecord').call({
    'mode':mode,if(mode=='managed')'orgId':orgId.text.trim(),
    'kind':kind,'id':id,'record':record,
   });
  }catch(e){
   if(mounted)setState(()=>error='Configuration could not be saved: $e');
  }finally{
   for(final controller in controllers.values){controller.dispose();}
   if(mounted){setState(()=>loading=false);await refresh();}
  }
 }
 Future<void> requestActivation(String subscriberId)async{
  final operation=TextEditingController(text:'activate');
  final reason=TextEditingController();
  try{
   final accepted=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(
    title:const Text('Request service activation'),
    content:Column(mainAxisSize:MainAxisSize.min,children:[
     const Text('Approval only. No router, RADIUS or billing command will be sent.'),
     TextField(controller:operation,decoration:const InputDecoration(
      labelText:'Operation',helperText:'activate, suspend, resume or deactivate')),
     TextField(controller:reason,maxLength:120,decoration:const InputDecoration(labelText:'Justification')),
    ]),
    actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancel')),
     FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Submit for approval'))]));
   if(accepted!=true||!mounted)return;
   setState(()=>loading=true);
   await functions.httpsCallable('requestIspServiceActivation').call({
    'mode':mode,if(mode=='managed')'orgId':orgId.text.trim(),
    'request':{
     'subscriberId':subscriberId,'operation':operation.text.trim(),
     'reason':reason.text.trim(),'idempotencyKey':'req_${DateTime.now().microsecondsSinceEpoch}',
    },
   });
   if(mounted)ScaffoldMessenger.of(context).showSnackBar(
    const SnackBar(content:Text('Activation request queued for independent approval. No device command executed.')));
  }catch(e){if(mounted)setState(()=>error='Activation request failed: $e');}
  finally{operation.dispose();reason.dispose();if(mounted)setState(()=>loading=false);}
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
   if(overview!=null&&kind!='incidents')OutlinedButton.icon(
    onPressed:loading?null:addConfiguredRecord,
    icon:const Icon(Icons.tune),label:Text('Configure $kind')),
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
      subtitle:Text('${record['status']??'Unknown'}'),
      trailing:kind=='subscribers'&&record['recordType']=='typed_configuration'
       ?IconButton(tooltip:'Request activation',icon:const Icon(Icons.play_circle_outline),
          onPressed:loading?null:()=>requestActivation(record['id']?.toString()??'')):null),
    if(hasMore)TextButton(onPressed:loading?null:loadMore,child:const Text('Load more records')),
   ],
  ])
 );
}
