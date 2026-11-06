import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';

/// Administrative hotspot inventory. Does not provision routers or accept payments.
class HotspotConsole extends StatefulWidget {
  const HotspotConsole({super.key});
  @override
  State<HotspotConsole> createState() => _HotspotConsoleState();
}
class _HotspotConsoleState extends State<HotspotConsole> {
  final api = FirebaseFunctions.instanceFor(region: 'europe-west1');
  String resource = 'sites';
  List<Map<String,dynamic>> rows = [];
  bool loading = false;
  String message = 'Management records only. Router authentication and payments are not connected.';
  Future<Map<String,dynamic>> invoke(String method, Map<String,dynamic> body) async {
    final result = await api.httpsCallable(method).call(body);
    return Map<String,dynamic>.from(result.data as Map);
  }
  @override void initState(){super.initState();refresh();}
  Future<void> refresh() async {
    setState(() => loading=true);
    try {
      final result = await invoke('hotspotList', {'resource':resource});
      if(mounted)setState(() {rows = (result['records'] as List).map((e)=>Map<String,dynamic>.from(e as Map)).toList();message='Records loaded. Network status is not live.';});
    } catch(e) {if(mounted)setState(()=>message='Load failed: $e');}
    finally {if(mounted)setState(()=>loading=false);}
  }
  Future<void> create() async {
    final fields = resource=='sites'?['name','location','ssid']:resource=='plans'?['name','durationMinutes','priceKes','downloadMbps','uploadMbps','maxDevices']:['siteId','planId'];
    final controllers = {for(final name in fields)name:TextEditingController()};
    try {
      final submitted = await showDialog<bool>(context:context,builder:(context)=>AlertDialog(
        title:Text('Create ${resource.substring(0,resource.length-1)}'),
        content:SizedBox(width:420,child:SingleChildScrollView(child:Column(mainAxisSize:MainAxisSize.min,children:[
          for(final field in fields)Padding(padding:const EdgeInsets.symmetric(vertical:6),child:TextField(
            controller:controllers[field],keyboardType:['durationMinutes','priceKes','downloadMbps','uploadMbps','maxDevices'].contains(field)?TextInputType.number:TextInputType.text,
            decoration:InputDecoration(labelText:field,border:const OutlineInputBorder()))),
        ]))),
        actions:[TextButton(onPressed:()=>Navigator.pop(context,false),child:const Text('Cancel')),FilledButton(onPressed:()=>Navigator.pop(context,true),child:const Text('Save'))],
      ));
      if(submitted!=true)return;
      final record=<String,dynamic>{for(final field in fields)field: ['durationMinutes','priceKes','downloadMbps','uploadMbps','maxDevices'].contains(field)?int.tryParse(controllers[field]!.text.trim()):controllers[field]!.text.trim()};
      final result=await invoke('hotspotCreate',{'resource':resource,'record':record});
      if(!mounted)return;
      final code=result['oneTimeCode'];
      if(code!=null)await showDialog<void>(context:context,builder:(context)=>AlertDialog(title:const Text('Voucher code — shown once'),content:SelectableText(code.toString()),actions:[FilledButton(onPressed:()=>Navigator.pop(context),child:const Text('I saved the code'))]));
      if(mounted)setState(()=>message='Saved. Router access has NOT been activated.');
      await refresh();
    }catch(e){if(mounted)setState(()=>message='Save failed: $e');}
    finally {for(final c in controllers.values)c.dispose();}
  }
  Future<void> pilotAction(Map<String,dynamic> item) async {
    final siteMode=resource=='sites';
    final input=TextEditingController();
    try {
      final approved=await showDialog<bool>(context:context,builder:(dialogContext)=>AlertDialog(
        title:Text(siteMode?'Commission pilot site':'Publish tariff'),
        content:Column(mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text(siteMode?'Confirm guest VLAN isolation, RADIUS NAS registration, accounting testing and a privacy notice. These confirmations are operator attestations, not live connectivity measurements.':'Enter an already commissioned site ID. This publishes pricing only and does not provision Wi-Fi.'),
          const SizedBox(height:14),
          TextField(controller:input,decoration:InputDecoration(labelText:siteMode?'Registered NAS ID':'Commissioned site ID',border:const OutlineInputBorder())),
        ]),
        actions:[TextButton(onPressed:()=>Navigator.pop(dialogContext,false),child:const Text('Cancel')),
          FilledButton(onPressed:()=>Navigator.pop(dialogContext,true),child:const Text('Confirm'))],
      ));
      if(approved!=true)return;
      final response=await invoke(siteMode?'hotspotCommissionSite':'hotspotPublishPlan',
        siteMode?{'siteId':item['id'],'nasId':input.text.trim(),
          'checklist':{'guestNetworkIsolated':true,'radiusNasRegistered':true,'radiusAccountingTested':true,'privacyNoticeReady':true},
          'publishPortal':false}:{'planId':item['id'],'siteId':input.text.trim()});
      if(mounted)setState(()=>message='Recorded: ${response['ok']}. This does not activate a router.');
      await refresh();
    }catch(e){if(mounted)setState(()=>message='Pilot action failed: $e');}
    finally{input.dispose();}
  }
  Future<void> togglePortal(Map<String,dynamic> item) async {
    try {
      final published=item['portalPublished']==true;
      await invoke('hotspotSetPortalVisibility',{'siteId':item['id'],'published':!published});
      if(mounted)setState(()=>message=published?'Guest portal hidden.':'Guest portal catalog published; purchases remain disabled.');
      await refresh();
    }catch(e){if(mounted)setState(()=>message='Portal visibility change failed: $e');}
  }
  Future<void> draftPaymentIntent(String voucherId) async {
    try {
      final result=await invoke('hotspotCreatePaymentIntent',{'voucherId':voucherId});
      if(mounted)setState(()=>message='Payment intent ${result['id']} saved as draft; no M-Pesa request was sent.');
    }catch(e){if(mounted)setState(()=>message='Payment intent not created: $e');}
  }
  Future<void> revoke(String id) async {
    try {await invoke('hotspotRevokeVoucher',{'id':id});if(mounted)setState(()=>message='Voucher marked revoked; router enforcement NOT executed.');await refresh();}
    catch(e){if(mounted)setState(()=>message='Revoke failed: $e');}
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Wi-Fi hotspot management')),
    body:Padding(padding:const EdgeInsets.all(20),child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      const Text('Captive portal · sites · tariffs · vouchers',style:TextStyle(fontSize:23,fontWeight:FontWeight.bold)),
      const SizedBox(height:9),
      const Text('Planning and voucher inventory only. No live device sessions, M-Pesa settlement or automatic activation.'),
      const SizedBox(height:12),
      Wrap(spacing:8,children:[for(final name in ['sites','plans','vouchers'])ChoiceChip(label:Text(name.toUpperCase()),selected:resource==name,onSelected:(_){setState(()=>resource=name);refresh();})]),
      Row(children:[Expanded(child:Text(message)),IconButton(onPressed:loading?null:refresh,icon:const Icon(Icons.refresh)),FilledButton.icon(onPressed:loading?null:create,icon:const Icon(Icons.add),label:const Text('Create'))]),
      if(loading)const LinearProgressIndicator(),
      Expanded(child:ListView.builder(itemCount:rows.length,itemBuilder:(context,index){
        final item=rows[index];
        return Card(child:ListTile(title:Text((item['name']??item['codeLast4']??item['id']).toString()),
          subtitle:Text(item.entries.where((e)=>!['codeHash','createdBy'].contains(e.key)).map((e)=>'${e.key}: ${e.value}').join('  •  '),maxLines:3,overflow:TextOverflow.ellipsis),
          trailing:resource=='vouchers'&&item['status']!='revoked'?Wrap(spacing:4,children:[
            TextButton(onPressed:()=>draftPaymentIntent(item['id'].toString()),child:const Text('Draft payment')),
            TextButton(onPressed:()=>revoke(item['id'].toString()),child:const Text('Revoke'))]):resource=='sites'&&item['status']=='planned'?TextButton(onPressed:()=>pilotAction(item),child:const Text('Commission')):resource=='sites'&&item['status']=='active'?TextButton(onPressed:()=>togglePortal(item),child:Text(item['portalPublished']==true?'Hide portal':'Publish portal')):resource=='plans'&&item['status']=='draft'?TextButton(onPressed:()=>pilotAction(item),child:const Text('Publish')):null));
      })),
    ])),
  );
}
