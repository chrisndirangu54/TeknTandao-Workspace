import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Tenant-scoped next-generation hotspot inventory. All writes are validated
/// against organization membership in Firebase Functions. No network provisioning.
class HotspotTenantConsole extends StatefulWidget {
  const HotspotTenantConsole({super.key});
  @override State<HotspotTenantConsole> createState()=>_HotspotTenantConsoleState();
}
class _HotspotTenantConsoleState extends State<HotspotTenantConsole> {
  final org=TextEditingController();
  final search=TextEditingController();
  final functions=FirebaseFunctions.instanceFor(region:'europe-west1');
  String resource='sites',message='Enter the Workspace organization ID to view its hotspot inventory.';
  bool busy=false;
  List<Map<String,dynamic>> records=[];
  String? cursor;
  @override void dispose(){org.dispose();search.dispose();super.dispose();}
  Future<Map<String,dynamic>> call(String name,Map<String,dynamic> data) async {
    final result=await functions.httpsCallable(name).call(data);
    return Map<String,dynamic>.from(result.data as Map);
  }
  Future<void> load({bool append=false}) async {
    if(!RegExp(r'^[A-Za-z0-9_-]{5,100}$').hasMatch(org.text.trim())){
      setState(()=>message='Enter a valid organization ID.');return;
    }
    setState(()=>busy=true);
    try{
      final res=await call('hotspotV2List',{
        'orgId':org.text.trim(),'resource':resource,'limit':25,
        if(append&&cursor!=null)'cursor':cursor,
      });
      final values=(res['records'] as List).map((e)=>Map<String,dynamic>.from(e as Map)).toList();
      if(mounted)setState((){
        records=append?[...records,...values]:values;
        cursor=res['nextCursor'] as String?;
        message='Showing ${records.length} records · tenant scoped · live gateway disconnected';
      });
    }catch(e){if(mounted)setState(()=>message='Unable to load: $e');}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> create() async {
    final fields=resource=='sites'?['name','ssid','location']:
      resource=='plans'?['siteId','name','durationMinutes','downloadMbps','uploadMbps','maxDevices','priceKes']:
      ['siteId','planId'];
    final controllers={for(final f in fields)f:TextEditingController()};
    try{
      final ok=await showDialog<bool>(context:context,builder:(dialogContext)=>AlertDialog(
        title:Text('New ${resource.substring(0,resource.length-1)}'),
        content:SizedBox(width:440,child:SingleChildScrollView(child:Column(
          mainAxisSize:MainAxisSize.min,children:[
            for(final f in fields)Padding(padding:const EdgeInsets.only(bottom:12),
              child:TextField(controller:controllers[f],
                keyboardType:['durationMinutes','downloadMbps','uploadMbps','maxDevices','priceKes'].contains(f)
                 ?TextInputType.number:TextInputType.text,
                decoration:InputDecoration(labelText:f,border:const OutlineInputBorder())))
          ]))),
        actions:[
          TextButton(onPressed:()=>Navigator.pop(dialogContext,false),child:const Text('Cancel')),
          FilledButton(onPressed:()=>Navigator.pop(dialogContext,true),child:const Text('Save'))
        ]));
      if(ok!=true)return;
      final record=<String,dynamic>{
        for(final f in fields) f: ['durationMinutes','downloadMbps','uploadMbps','maxDevices','priceKes'].contains(f)
          ? int.tryParse(controllers[f]!.text.trim()):controllers[f]!.text.trim()
      };
      final out=await call('hotspotV2Create',{'orgId':org.text.trim(),'resource':resource,'record':record});
      if(!mounted)return;
      if(out['oneTimeCode']!=null){
        await showDialog<void>(context:context,builder:(dialogContext)=>AlertDialog(
          title:const Text('One-time voucher code'),
          content:Column(mainAxisSize:MainAxisSize.min,children:[
            const Text('Copy this code now. It cannot be recovered from the server. It does NOT grant internet access.'),
            const SizedBox(height:12),
            SelectableText(out['oneTimeCode'].toString()),
          ]),
          actions:[
            TextButton(onPressed:(){
              Clipboard.setData(ClipboardData(text:out['oneTimeCode'].toString()));
            },child:const Text('Copy')),
            FilledButton(onPressed:()=>Navigator.pop(dialogContext),child:const Text('Done'))
          ]));
      }
      if(mounted)setState(()=>message='Record created. No router commands or payments executed.');
      await load();
    }catch(e){if(mounted)setState(()=>message='Create failed: $e');}
    finally{for(final c in controllers.values)c.dispose();}
  }
  Future<void> revoke(String voucherId) async {
    try{
      await call('hotspotV2Revoke',{'orgId':org.text.trim(),'voucherId':voucherId});
      if(mounted)setState(()=>message='Voucher revoked in inventory. Gateway disconnect not executed.');
      await load();
    }catch(e){if(mounted)setState(()=>message='Revocation failed: $e');}
  }
  @override Widget build(BuildContext context){
    final filtered=records.where((r)=>
      r.toString().toLowerCase().contains(search.text.toLowerCase())).toList();
    return Scaffold(
      appBar:AppBar(title:const Text('Hotspot Control Center'),actions:[
        IconButton(onPressed:busy?null:()=>load(),tooltip:'Refresh records',icon:const Icon(Icons.refresh))
      ]),
      body:Center(child:ConstrainedBox(constraints:const BoxConstraints(maxWidth:1160),
        child:Padding(padding:const EdgeInsets.all(20),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          const Text('Managed Wi-Fi',style:TextStyle(fontSize:30,fontWeight:FontWeight.bold)),
          const SizedBox(height:4),
          const Text('Tenant-scoped control plane · operational commands disabled'),
          const SizedBox(height:18),
          TextField(controller:org,decoration:InputDecoration(
            labelText:'Workspace organization ID',prefixIcon:const Icon(Icons.apartment_outlined),
            border:const OutlineInputBorder(),suffixIcon:IconButton(onPressed:busy?null:()=>load(),
              icon:const Icon(Icons.arrow_forward)))),
          const SizedBox(height:14),
          Wrap(spacing:8,runSpacing:8,children:[
            for(final name in ['sites','plans','vouchers'])ChoiceChip(
              label:Text(name.toUpperCase()),selected:name==resource,
              onSelected:(_){setState(()=>resource=name);load();})
          ]),
          const SizedBox(height:12),
          Row(children:[
            Expanded(child:TextField(controller:search,onChanged:(_)=>setState((){}),
              decoration:const InputDecoration(prefixIcon:Icon(Icons.search),
                hintText:'Filter loaded records',border:OutlineInputBorder()))),
            const SizedBox(width:10),
            FilledButton.icon(onPressed:busy?null:create,icon:const Icon(Icons.add),
              label:const Text('Create'))
          ]),
          Padding(padding:const EdgeInsets.symmetric(vertical:12),child:Text(message,
            style:TextStyle(color:Theme.of(context).colorScheme.onSurfaceVariant))),
          if(busy)const LinearProgressIndicator(),
          Expanded(child:records.isEmpty?const Center(child:Text('No records in this tenant or nothing loaded.')):
            ListView.separated(itemCount:filtered.length,separatorBuilder:(_,__)=>const SizedBox(height:8),
              itemBuilder:(context,index){
                final row=filtered[index];
                return Card(elevation:0,shape:RoundedRectangleBorder(
                  side:BorderSide(color:Theme.of(context).colorScheme.outlineVariant),
                  borderRadius:BorderRadius.circular(12)),
                  child:ListTile(
                    leading:Icon(resource=='sites'?Icons.router_outlined:
                      resource=='plans'?Icons.speed_outlined:Icons.confirmation_number_outlined),
                    title:Text((row['name']??row['codeLast4']??row['id']).toString()),
                    subtitle:Text('Status: ${row['state']??'draft'} · ID: ${row['id']}',maxLines:2),
                    trailing:resource=='vouchers'&&row['state']!='revoked'?
                      IconButton(tooltip:'Revoke voucher record',onPressed:()=>revoke(row['id'].toString()),
                        icon:const Icon(Icons.block)):null,
                  ));
              })),
          if(cursor!=null)Align(alignment:Alignment.center,child:TextButton(
            onPressed:busy?null:()=>load(append:true),child:const Text('Load more'))),
        ])))),
    );
  }
}
