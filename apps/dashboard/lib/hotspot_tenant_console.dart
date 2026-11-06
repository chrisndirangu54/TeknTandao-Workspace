import 'package:cloud_functions/cloud_functions.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Tenant-scoped hotspot inventory. All writes use Workspace member authorization.
class HotspotTenantConsole extends StatefulWidget {
  const HotspotTenantConsole({super.key});
  @override State<HotspotTenantConsole> createState()=>_HotspotTenantConsoleState();
}
class _HotspotTenantConsoleState extends State<HotspotTenantConsole> {
  final org=TextEditingController();
  final search=TextEditingController();
  final functions=FirebaseFunctions.instanceFor(region:'europe-west1');
  String resource='sites',message='Select a Workspace organization to view hotspot inventory.';
  bool busy=false;
  List<Map<String,dynamic>> records=[];
  String? cursor;
  @override void initState(){super.initState();_resolveActiveWorkspace();}
  Future<void> _resolveActiveWorkspace() async {
    final user=FirebaseAuth.instance.currentUser;
    if(user==null)return;
    try{
      final profile=await FirebaseFirestore.instance.collection('users').doc(user.uid).get();
      final active=profile.data()?['orgId']?.toString()??'';
      if(!mounted||!RegExp(r'^[A-Za-z0-9_-]{5,100}$').hasMatch(active))return;
      org.text=active;
      await load();
    }catch(e){
      if(mounted)setState(()=>message='Select a Workspace organization to continue.');
    }
  }
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
  Future<void> operate(Map<String,dynamic> item,String action) async {
    if(busy)return;
    try{
      if(action=='revoke'){await revoke(item['id'].toString());return;}
      final payload=<String,dynamic>{'orgId':org.text.trim()};
      String endpoint='';
      if(action=='commission'){
        final nas=TextEditingController();
        final checks={'vlanIsolated':false,'radiusTested':false,'accountingTested':false,'noticePublished':false};
        try{
          final confirmed=await showDialog<bool>(context:context,builder:(dialogContext)=>
            StatefulBuilder(builder:(ctx,update)=>AlertDialog(
              title:const Text('Commission site'),
              content:SizedBox(width:450,child:SingleChildScrollView(child:Column(mainAxisSize:MainAxisSize.min,children:[
                const Text('Confirm each check only after testing it on your own network. Commissioning does not establish live connectivity.'),
                TextField(controller:nas,onChanged:(_)=>update((){}),decoration:const InputDecoration(labelText:'Registered NAS identifier')),
                for(final entry in checks.keys)CheckboxListTile(
                  title:Text(entry),value:checks[entry],
                  onChanged:(v)=>update(()=>checks[entry]=v??false)),
              ]))),
              actions:[TextButton(onPressed:()=>Navigator.pop(dialogContext,false),child:const Text('Cancel')),
                FilledButton(onPressed:nas.text.trim().isNotEmpty&&checks.values.every((v)=>v)
                  ?()=>Navigator.pop(dialogContext,true):null,child:const Text('Record checks'))],
            )));
          if(confirmed!=true)return;
          endpoint='hotspotV2CommissionSite';
          payload.addAll({'siteId':item['id'],'nasId':nas.text.trim(),'checks':checks});
        }finally{nas.dispose();}
      }else if(action=='publish'){
        endpoint='hotspotV2PublishPlan';payload['planId']=item['id'];
      }else if(action=='prepare'){
        endpoint='hotspotV2PrepareVoucher';payload['voucherId']=item['id'];
      }else if(action=='sandbox_mpesa'){
        final phone=TextEditingController();
        try{
          final ok=await showDialog<bool>(context:context,builder:(dialogContext)=>AlertDialog(
            title:const Text('Sandbox M-Pesa test'),
            content:Column(mainAxisSize:MainAxisSize.min,children:[
              const Text('Test environment only. This does not verify a receipt or activate internet.'),
              TextField(controller:phone,keyboardType:TextInputType.phone,
                decoration:const InputDecoration(labelText:'Sandbox test phone (2547… / 2541…)')),
            ]),
            actions:[TextButton(onPressed:()=>Navigator.pop(dialogContext,false),child:const Text('Cancel')),
              FilledButton(onPressed:()=>Navigator.pop(dialogContext,true),child:const Text('Test STK request'))]));
          if(ok!=true)return;
          endpoint='hotspotV2StartSandboxMpesa';payload.addAll({'voucherId':item['id'],'phone':phone.text.trim()});
        }finally{phone.dispose();}
      }else if(action=='query_mpesa'){
        endpoint='hotspotV2QuerySandboxMpesa';payload['voucherId']=item['id'];
      }else if(action=='disconnect'){
        final reason=TextEditingController();
        try{
          final ok=await showDialog<bool>(context:context,builder:(dialogContext)=>AlertDialog(
            title:const Text('Request gateway disconnection'),
            content:TextField(controller:reason,minLines:2,maxLines:3,
              decoration:const InputDecoration(labelText:'Reason for disconnect request')),
            actions:[TextButton(onPressed:()=>Navigator.pop(dialogContext,false),child:const Text('Cancel')),
              FilledButton(onPressed:()=>Navigator.pop(dialogContext,true),child:const Text('Request review'))]));
          if(ok!=true)return;
          endpoint='hotspotV2RequestDisconnect';payload.addAll({'voucherId':item['id'],'reason':reason.text.trim()});
        }finally{reason.dispose();}
      }else{return;}
      setState(()=>busy=true);
      final res=await call(endpoint,payload);
      if(mounted)setState(()=>message=action=='sandbox_mpesa'
        ?'Sandbox checkout requested. No access granted.'
        :action=='query_mpesa'
          ?'Provider query: ${res['providerQueryCode']}. Receipt unverified; no access granted.'
          :'Recorded: ${res['ok']}. No router commands executed.');
      await load();
    }catch(e){if(mounted)setState(()=>message='Action failed: $e');}
    finally{if(mounted)setState(()=>busy=false);}
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
                    trailing:PopupMenuButton<String>(
                      tooltip:'Manage record',onSelected:(action)=>operate(row,action),
                      itemBuilder:(_)=>[
                        if(resource=='sites'&&row['state']=='draft')
                          const PopupMenuItem(value:'commission',child:Text('Commission site')),
                        if(resource=='plans'&&row['state']=='draft')
                          const PopupMenuItem(value:'publish',child:Text('Publish plan')),
                        if(resource=='vouchers'&&row['state']=='draft')
                          const PopupMenuItem(value:'prepare',child:Text('Prepare voucher')),
                        if(resource=='vouchers'&&row['state']=='pending_payment')
                          const PopupMenuItem(value:'sandbox_mpesa',child:Text('Sandbox STK request')),
                        if(resource=='vouchers'&&row['state']=='pending_payment')
                          const PopupMenuItem(value:'query_mpesa',child:Text('Query sandbox payment')),
                        if(resource=='vouchers'&&row['state']!='revoked')
                          const PopupMenuItem(value:'revoke',child:Text('Revoke voucher')),
                        if(resource=='vouchers'&&row['state']=='revoked')
                          const PopupMenuItem(value:'disconnect',child:Text('Request disconnection')),
                      ],
                    ),
                  ));
              })),
          if(cursor!=null)Align(alignment:Alignment.center,child:TextButton(
            onPressed:busy?null:()=>load(append:true),child:const Text('Load more'))),
        ])))),
    );
  }
}
