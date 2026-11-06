import 'package:cloud_functions/cloud_functions.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

/// Sponsor monetization and operational intelligence. All backend data is tenant scoped.
class HotspotGrowthConsole extends StatefulWidget {
 const HotspotGrowthConsole({super.key});
 @override State<HotspotGrowthConsole> createState()=>_HotspotGrowthConsoleState();
}
class _HotspotGrowthConsoleState extends State<HotspotGrowthConsole>{
 final functions=FirebaseFunctions.instanceFor(region:'europe-west1');
 final org=TextEditingController(),site=TextEditingController(),plan=TextEditingController();
 final title=TextEditingController(),advertiser=TextEditingController();
 final creative=TextEditingController(),destination=TextEditingController();
 final googleAdUnit=TextEditingController(),ssvTestReference=TextEditingController();
 final latitude=TextEditingController(),longitude=TextEditingController(),iotLabel=TextEditingController(),deviceId=TextEditingController();
 List<Map<String,dynamic>> campaigns=[];
 List<Map<String,dynamic>> sponsorApplicants=[];
 Map<String,dynamic>? intelligence,environment;
 String status='Select a site for sponsored passes, signed IoT devices and geospatial analytics.';
 bool busy=false;
 @override void initState(){super.initState();_loadOrg();}
 Future<void> _loadOrg()async{
  final uid=FirebaseAuth.instance.currentUser?.uid;if(uid==null)return;
  try{
   final doc=await FirebaseFirestore.instance.collection('users').doc(uid).get();
   if(mounted)org.text=doc.data()?['orgId']?.toString()??'';
  }catch(_){}
 }
 @override void dispose(){
  for(final c in [org,site,plan,title,advertiser,creative,destination,googleAdUnit,ssvTestReference,latitude,longitude,iotLabel,deviceId])c.dispose();
  super.dispose();
 }
 Future<Map<String,dynamic>> invoke(String method,Map<String,dynamic> data)async{
  final result=await functions.httpsCallable(method).call({'orgId':org.text.trim(),...data});
  return Map<String,dynamic>.from(result.data as Map);
 }
 Future<void> execute(String name,Map<String,dynamic> payload,{String? success})async{
  if(busy)return;setState(()=>busy=true);
  try{
   final out=await invoke(name,payload);
   if(!mounted)return;
   if(name=='hotspotV2SponsorAdminList'){
    setState(()=>campaigns=(out['campaigns'] as List).map((e)=>Map<String,dynamic>.from(e as Map)).toList());
   }
   if(name=='hotspotV2SponsorAdminCampaigns')setState(()=>campaigns=(out['campaigns'] as List)
     .map((e)=>Map<String,dynamic>.from(e as Map)).toList());
   if(name=='hotspotV2SponsorListApplicants')setState(()=>sponsorApplicants=(out['applicants'] as List)
     .map((e)=>Map<String,dynamic>.from(e as Map)).toList());
   if(name=='hotspotV2OperationsIntelligence')setState(()=>intelligence=out);
   if(name=='hotspotV2RefreshNasaPower')setState(()=>environment=out);
   if(name=='hotspotV2RegisterIoTDevice'&&out['oneTimeSecret']!=null){
    await showDialog<void>(context:context,builder:(ctx)=>AlertDialog(
     title:const Text('One-time IoT device secret'),
     content:Column(mainAxisSize:MainAxisSize.min,children:[
      const Text('Store this secret securely on the device. It cannot be fetched again.'),
      SelectableText('Device ID: ${out['deviceId']}\nSecret: ${out['oneTimeSecret']}')]),
     actions:[FilledButton(onPressed:()=>Navigator.pop(ctx),child:const Text('Saved'))]));
   }
   if(name=='hotspotV2RotateBridgeKey'&&out['oneTimeBridgeSecret']!=null&&mounted){
    await showDialog<void>(context:context,builder:(ctx)=>AlertDialog(
      title:const Text('Private site RADIUS bridge secret'),
      content:Column(mainAxisSize:MainAxisSize.min,children:[
        const Text('Copy this secret only to the private gateway. Rotation revokes the previous signing key.'),
        SelectableText(out['oneTimeBridgeSecret'].toString())]),
      actions:[FilledButton(onPressed:()=>Navigator.pop(ctx),child:const Text('Saved securely'))]));
   }
   if(mounted)setState(()=>status=success??'Operation completed. Results are sourced from backend records.');
  }catch(e){if(mounted)setState(()=>status='Operation unavailable: $e');}
  finally{if(mounted)setState(()=>busy=false);}
 }
 Widget field(String label,TextEditingController c,{bool number=false})=>Padding(
  padding:const EdgeInsets.only(bottom:10),
  child:TextField(controller:c,keyboardType:number?TextInputType.number:TextInputType.text,
   decoration:InputDecoration(labelText:label,border:const OutlineInputBorder())));
 Widget section(String heading,List<Widget> children)=>Card(child:Padding(padding:const EdgeInsets.all(18),
   child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
    Text(heading,style:Theme.of(context).textTheme.titleLarge),const SizedBox(height:12),...children])));
 @override Widget build(BuildContext context)=>Scaffold(
  appBar:AppBar(title:const Text('Hotspot Growth & Intelligence')),
  body:Align(alignment:Alignment.topCenter,child:ConstrainedBox(constraints:const BoxConstraints(maxWidth:1000),
   child:ListView(padding:const EdgeInsets.all(20),children:[
    const Text('Sponsored Wi-Fi · Analytics · IoT · Geospatial context',
      style:TextStyle(fontWeight:FontWeight.bold,fontSize:22)),
    const SizedBox(height:8),
    const Text('Sponsored rewards require an independently approved lab gateway. Analytics report measured data and explicitly label missing sources.'),
    const SizedBox(height:16),
    field('Active Workspace ID',org),field('Site ID',site),field('Free Plan ID',plan),
    if(busy)const LinearProgressIndicator(),
    Padding(padding:const EdgeInsets.symmetric(vertical:12),child:Text(status)),
    section('Local sponsor onboarding and approvals',[
      const Text('Local businesses apply through the advertiser website. An operator independently approves them. Funded campaigns need a separate activation review.'),
      OutlinedButton.icon(onPressed:busy?null:()=>execute('hotspotV2SponsorListApplicants',{}),
        icon:const Icon(Icons.business_outlined),label:const Text('Review sponsor applications')),
      for(final applicant in sponsorApplicants)
        ListTile(title:Text(applicant['businessName']?.toString()??'Advertiser'),
          subtitle:Text('Status: ${applicant['status']} · ${applicant['contactEmail']??''}'),
          trailing:applicant['status']=='pending_review'?TextButton(
            onPressed:busy?null:()=>execute('hotspotV2SponsorApprove',{'sponsorUid':applicant['uid']},
              success:'Advertiser approved. Refresh applicants to confirm status.'),
            child:const Text('Approve')):null),
      const Text('Advertiser portal: hotspot-advertisers.html · Google rewarded portal: hotspot-google-rewards.html'),
    ]),
    section('Sponsored access instead of payment',[
      field('Sponsor campaign title',title),field('Advertiser',advertiser),
      field('Creative image HTTPS URL',creative),field('Sponsor destination HTTPS URL',destination),
      Wrap(spacing:10,runSpacing:8,children:[
        FilledButton.icon(icon:const Icon(Icons.campaign_outlined),label:const Text('Create draft campaign'),
         onPressed:busy?null:()=>execute('hotspotV2CreateSponsorCampaign',{
          'siteId':site.text.trim(),'planId':plan.text.trim(),
          'title':title.text.trim(),'advertiser':advertiser.text.trim(),
          'creativeUrl':creative.text.trim(),'destinationUrl':destination.text.trim(),
          'rewardLimit':100,'minDwellSeconds':15,
          'startsAtMs':DateTime.now().millisecondsSinceEpoch,
          'endsAtMs':DateTime.now().add(const Duration(days:7)).millisecondsSinceEpoch,
         },success:'Campaign drafted. A different administrator must approve it.')),
        OutlinedButton(onPressed:busy?null:()=>execute('hotspotV2SponsorAdminList',{}),
          child:const Text('Load campaigns')),
      ]),
      OutlinedButton.icon(onPressed:busy?null:()=>execute('hotspotV2SponsorAdminCampaigns',{}),
        icon:const Icon(Icons.receipt_long_outlined),label:const Text('Review funded campaigns')),
      for(final c in campaigns)ListTile(
        title:Text(c['title']?.toString()??'Campaign'),
        subtitle:Text('${c['advertiser']} · ${c['status']} · rewards ${c['rewardedCount']}/${c['rewardLimit']}'),
        trailing:c['status']=='awaiting_review'?TextButton(onPressed:busy?null:
          ()=>execute('hotspotV2SponsorActivateCampaign',{'campaignId':c['id']},
            success:'Verified test-funded sponsor campaign approved.'),child:const Text('Activate')):
          c['status']=='draft'?TextButton(onPressed:busy?null:
          ()=>execute('hotspotV2ApproveSponsorCampaign',{'campaignId':c['id']},
            success:'Campaign approved for approved laboratory sites only.'),
          child:const Text('Approve')):
          c['status']=='active'?TextButton(onPressed:busy?null:
           ()=>execute('hotspotV2PauseSponsorCampaign',{'campaignId':c['id']},
            success:'New sponsored rewards paused; already-issued passes remain valid.'),
           child:const Text('Pause')):null),
      const Text('Ad impressions and sponsor billing are not verified by the time gate.',
        style:TextStyle(fontSize:12)),
    ]),
    section('Google rewarded Wi-Fi: 3–5 ads for 30 minutes',[
      const Text('Configure an Ad Manager rewarded WEB ad unit. Enabling requires independently verified SSV and a second administrator. No ad is presented before site approval.'),
      field('Google rewarded ad unit path',googleAdUnit),
      field('SSV end-to-end test reference',ssvTestReference),
      Wrap(spacing:10,runSpacing:8,children:[
        OutlinedButton.icon(icon:const Icon(Icons.verified_user_outlined),
          onPressed:busy?null:()=>execute('hotspotV2RequestGoogleSite',{
            'siteId':site.text.trim(),'adUnit':googleAdUnit.text.trim(),
            'ssvTestReference':ssvTestReference.text.trim()
          },success:'Google site review requested. A separate admin must verify SSV.'),
          label:const Text('Request Google site review')),
        FilledButton.icon(icon:const Icon(Icons.check_circle_outline),
          onPressed:busy?null:()=>execute('hotspotV2ApproveGoogleSite',{
            'siteId':site.text.trim()
          },success:'Google site approved by second admin. Confirm actual Google SSV verification is running.'),
          label:const Text('Second-admin approval')),
      ]),
    ]),
    section('Gateway credentials and IoT telemetry',[
      OutlinedButton.icon(
        onPressed:busy?null:()=>execute('hotspotV2RotateBridgeKey',{'siteId':site.text.trim()},
          success:'New per-site bridge key generated. Install it on the isolated gateway host.'),
        icon:const Icon(Icons.key),label:const Text('Rotate private gateway key')),
      const SizedBox(height:12),
      field('Device label',iotLabel),field('Device ID for revocation',deviceId),
      Wrap(spacing:10,runSpacing:8,children:[
        FilledButton.icon(onPressed:busy?null:()=>execute('hotspotV2RegisterIoTDevice',{
          'siteId':site.text.trim(),'label':iotLabel.text.trim()}),
          icon:const Icon(Icons.sensors),label:const Text('Register IoT device')),
        OutlinedButton.icon(onPressed:busy?null:()=>execute('hotspotV2DisableIoTDevice',{
          'deviceId':deviceId.text.trim()},success:'Device signing credential revoked.'),
          icon:const Icon(Icons.block),label:const Text('Revoke IoT device')),
        OutlinedButton.icon(onPressed:busy?null:()=>execute('hotspotV2OperationsIntelligence',{
          'siteId':site.text.trim()}),icon:const Icon(Icons.analytics_outlined),
          label:const Text('Refresh intelligence')),
      ]),
      if(intelligence!=null)...[
        Text('Registered devices: ${intelligence!['registeredDevices']??0} · telemetry samples: ${intelligence!['telemetrySampleCount']??0}'),
        Text('Sponsored rewards: ${intelligence!['sponsoredRewardCount']??0} · risk score: ${intelligence!['anomaly']?['score']??'unavailable'}'),
        Text('Model: ${intelligence!['aiAssist']?['model']??'none'} (not trained ML)'),
        if(intelligence!['statistics']?['available']==true)
          Text('Median clients: ${intelligence!['statistics']?['medianClients']} · '
            '95th percentile latency: ${intelligence!['statistics']?['latencyP95Ms']} ms'),
        if(intelligence!['planningForecast']?['available']==true)
          Text('Next-hour planning estimate: ${intelligence!['planningForecast']?['forecastClients']} clients (uncalibrated)'),
        for(final tip in (intelligence!['aiAssist']?['suggestions'] as List? ??[]))
          ListTile(dense:true,leading:const Icon(Icons.lightbulb_outline),title:Text(tip.toString())),
      ],
    ]),
    section('Satellite-derived environmental intelligence',[
      const Text('Historical NASA POWER gridded data, not live satellite imagery or local sensor observations.'),
      field('Site latitude',latitude,number:true),field('Site longitude',longitude,number:true),
      Wrap(spacing:10,runSpacing:8,children:[
        OutlinedButton(onPressed:busy?null:()=>execute('hotspotV2SetSiteCoordinates',{
          'siteId':site.text.trim(),'latitude':double.tryParse(latitude.text.trim()),
          'longitude':double.tryParse(longitude.text.trim()),
          'accuracyStatement':'Operator-reported location, pending external GPS verification.'}),
          child:const Text('Save coordinates')),
        FilledButton(onPressed:busy?null:()=>execute('hotspotV2RefreshNasaPower',{'siteId':site.text.trim()}),
          child:const Text('Retrieve NASA POWER data')),
      ]),
      if(environment!=null)...[
        Text('Data source: ${environment!['source']}'),
        Text('Latest data date: ${environment!['latestDataDate']}'),
        Text('Temperature: ${environment!['summary']?['temperatureC']} °C'),
        Text('Rainfall: ${environment!['summary']?['precipitationMmPerDay']} mm/day'),
        Text('Wind: ${environment!['summary']?['windMps']} m/s'),
        Text('Solar radiation: ${environment!['summary']?['solarKwhM2PerDay']} kWh/m²/day'),
      ]
    ]),
   ])))); 
}
