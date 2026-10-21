import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

class WhatsAppWorkspaceSettings extends StatefulWidget {
  final String workspaceId;
  const WhatsAppWorkspaceSettings({super.key,required this.workspaceId});
  @override State<WhatsAppWorkspaceSettings> createState()=>_WhatsAppWorkspaceSettingsState();
}
class _WhatsAppWorkspaceSettingsState extends State<WhatsAppWorkspaceSettings> {
  final phone=TextEditingController(),business=TextEditingController(),organization=TextEditingController(),recipient=TextEditingController();
  bool busy=false; String status='Loading workspace configuration…',leadId='';
  HttpsCallable call(String name)=>FirebaseFunctions.instanceFor(region:'europe-west1').httpsCallable(name);
  @override void initState(){super.initState();load();}
  Future<void> load() async {
    try {final r=await call('getWhatsAppWorkspaceSettings').call({'orgId':widget.workspaceId});
      final s=Map<String,dynamic>.from((r.data as Map)['sender']??{});
      if(!mounted)return;setState((){phone.text=s['phone']??'';business.text=s['displayName']??'';status=s.isEmpty?'Not configured. Sending is disabled.':'Configuration saved. API sending is disabled pending verification.';});
    } catch(e){if(mounted)setState(()=>status='Unable to load settings: $e');}
  }
  Future<void> run(Future<void> Function() fn) async {
    setState(()=>busy=true);try{await fn();}catch(e){if(mounted)setState(()=>status='Error: $e');}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> save()=>run(()async {
    await call('configureWhatsAppWorkspace').call({'orgId':widget.workspaceId,'phone':phone.text,'displayName':business.text});
    if(mounted)setState(()=>status='Workspace business number saved, pending Meta verification. Automated sending remains disabled.');
  });
  Future<void> remove()=>run(()async {
    await call('disableWhatsAppWorkspace').call({'orgId':widget.workspaceId});
    if(mounted)setState((){phone.clear();business.clear();status='Workspace number removed.';});
  });
  Future<void> prepare()=>run(()async {
    final saved=await call('upsertWhatsAppLead').call({'orgId':widget.workspaceId,'lead':{'organization':organization.text,'phone':recipient.text,'consentStatus':'unverified','sourceUrl':''}});
    leadId=(saved.data as Map)['leadId'] as String;
    final prepared=await call('prepareWhatsAppChat').call({'orgId':widget.workspaceId,'leadId':leadId,'locale':'en','category':'business'});
    final uri=Uri.parse((prepared.data as Map)['url'] as String);
    if(!await launchUrl(uri,mode:LaunchMode.externalApplication))throw StateError('Could not open WhatsApp');
    if(mounted)setState(()=>status='Opened WhatsApp draft. Message was NOT sent automatically.');
  });
  @override void dispose(){phone.dispose();business.dispose();organization.dispose();recipient.dispose();super.dispose();}
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('WhatsApp Business • Workspace settings')),
    body:ListView(padding:const EdgeInsets.all(20),children:[
      Text('Each workspace administrator configures their own business number. No default number is supplied.',style:Theme.of(context).textTheme.bodyLarge),
      const SizedBox(height:16),
      TextField(controller:business,decoration:const InputDecoration(labelText:'Business display name',border:OutlineInputBorder())),
      const SizedBox(height:12),
      TextField(controller:phone,keyboardType:TextInputType.phone,decoration:const InputDecoration(labelText:'Business number (+country code)',border:OutlineInputBorder())),
      const SizedBox(height:10),
      Wrap(spacing:8,children:[
        FilledButton(onPressed:busy?null:save,child:const Text('Save settings')),
        OutlinedButton(onPressed:busy?null:remove,child:const Text('Remove number')),
      ]),
      const Divider(height:36),
      Text('Manual outreach draft',style:Theme.of(context).textTheme.titleMedium),
      const SizedBox(height:6),
      const Text('Use only confirmed business contacts. Opening a draft does not send it; review it in WhatsApp before sending.'),
      const SizedBox(height:12),
      TextField(controller:organization,decoration:const InputDecoration(labelText:'Recipient organization',border:OutlineInputBorder())),
      const SizedBox(height:12),
      TextField(controller:recipient,keyboardType:TextInputType.phone,decoration:const InputDecoration(labelText:'Recipient WhatsApp number (+country code)',border:OutlineInputBorder())),
      const SizedBox(height:12),
      FilledButton(onPressed:busy?null:prepare,child:const Text('Open manual WhatsApp draft')),
      const SizedBox(height:20),
      Text(status),
      const SizedBox(height:12),
      const Text('Meta Business coexistence / Cloud API onboarding and inbound webhooks are not connected. Automated sending is unavailable until verified and configured.'),
    ]));
}
