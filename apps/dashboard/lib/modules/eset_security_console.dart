import 'package:flutter/material.dart';
import '../suite.dart';

/// ESET customer security view: no client-side API credentials and no remote writes.
class EsetSecurityConsole extends StatefulWidget {
  const EsetSecurityConsole({super.key, required this.store});
  final SuiteStore store;
  @override
  State<EsetSecurityConsole> createState() => _EsetSecurityConsoleState();
}
class _EsetSecurityConsoleState extends State<EsetSecurityConsole> {
  bool loading = false;
  String? error;
  Map<String,dynamic> overview = const {};
  List<Map<String,dynamic>> devices = const [];
  List<Map<String,dynamic>> detections = const [];
  List<Map<String,dynamic>> operations = const [];
  @override
  void initState() {super.initState();refresh();}
  Future<void> refresh() async {
    if (widget.store.demo) {
      setState(() {error='ESET data is unavailable in preview mode. Connect an approved tenant in production.';});
      return;
    }
    setState(() {loading=true;error=null;});
    try {
      final results=await Future.wait([widget.store.call('getEsetSecurityOverview'),widget.store.call('listEsetOperationReviews')]);
      final result=results[0];
      if (!mounted) return;
      setState(() {
        overview=result;
        operations=(results[1]['requests'] as List? ?? []).map((e)=>Map<String,dynamic>.from(e as Map)).toList();
        devices=(result['devices'] as List? ?? []).map((e)=>Map<String,dynamic>.from(e as Map)).toList();
        detections=(result['detections'] as List? ?? []).map((e)=>Map<String,dynamic>.from(e as Map)).toList();
      });
    } catch (_) {
      if(mounted)setState(()=>error='Unable to retrieve security data. Check tenant access and deployment.');
    } finally {
      if(mounted)setState(()=>loading=false);
    }
  }
  Future<void> requestReview() async {
    final target=TextEditingController(),reason=TextEditingController();
    String kind='license_quote';
    final result=await showDialog<bool>(context:context,builder:(context)=>StatefulBuilder(
      builder:(context,setDialog)=>AlertDialog(
        title:const Text('Request ESET operation review'),
        content:SizedBox(width:440,child:Column(mainAxisSize:MainAxisSize.min,children:[
          const Text('This creates a manual review request only. No licence is purchased and no endpoint changes are performed.'),
          const SizedBox(height:12),
          DropdownButtonFormField<String>(
            initialValue:kind,
            items:const [
              DropdownMenuItem(value:'license_quote',child:Text('Licence quote')),
              DropdownMenuItem(value:'license_renewal',child:Text('Licence renewal')),
              DropdownMenuItem(value:'endpoint_remediation_review',child:Text('Endpoint remediation')),
              DropdownMenuItem(value:'policy_change_review',child:Text('Policy change')),
              DropdownMenuItem(value:'incident_resolution_review',child:Text('Incident resolution'))
            ],onChanged:(v)=>setDialog(()=>kind=v??kind)),
          TextField(controller:target,decoration:const InputDecoration(labelText:'Customer/device/reference ID')),
          TextField(controller:reason,maxLines:2,decoration:const InputDecoration(labelText:'Reason and customer approval context'))
        ])),
        actions:[
          TextButton(onPressed:()=>Navigator.pop(context,false),child:const Text('Cancel')),
          FilledButton(onPressed:()=>Navigator.pop(context,true),child:const Text('Submit review'))
        ])));
    if(result!=true){target.dispose();reason.dispose();return;}
    try {
      await widget.store.call('requestEsetOperationReview',{'request':{
        'kind':kind,'targetId':target.text.trim(),'reason':reason.text.trim(),
        'customerApproved':true}});
      await refresh();
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Review request recorded; no ESET action executed.')));
    }catch(_){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Could not submit review request. Check the approved binding and required fields.')));
    }finally{target.dispose();reason.dispose();}
  }
  Widget _statusCard(String title,String value,IconData icon) => Card(
    child: Padding(padding:const EdgeInsets.all(16),child:Column(
      crossAxisAlignment:CrossAxisAlignment.start,children:[
      Icon(icon,color:Colors.blueGrey),
      const SizedBox(height:10),Text(value,style:Theme.of(context).textTheme.headlineMedium),
      Text(title)])));
  @override
  Widget build(BuildContext context) {
    final connected=overview['status']=='approved';
    final last=overview['lastSyncAt']?.toString()??'Not yet synced';
    return Scaffold(
      appBar:AppBar(title:const Text('ESET Cybersecurity Center'),
        actions:[IconButton(onPressed:loading?null:refresh,icon:const Icon(Icons.refresh),tooltip:'Refresh saved snapshot')]),
      body:ListView(padding:const EdgeInsets.all(20),children:[
        Text('Endpoint protection and incident visibility',style:Theme.of(context).textTheme.titleLarge),
        const SizedBox(height:8),
        const Text('Read-only integration. Live remote actions, purchasing and provisioning remain disabled until ESET permissions and operational tests are approved.'),
        const SizedBox(height:16),
        if(loading)const LinearProgressIndicator(),
        if(error!=null)Text(error!,style:const TextStyle(color:Colors.red)),
        Card(child:ListTile(
          leading:Icon(connected?Icons.verified_user:Icons.lock_outline),
          title:Text(connected?'Customer binding approved':'Awaiting MSP/Connect access'),
          subtitle:Text('Region: ${overview['region']??'Not configured'} • Last sync: $last'),
          trailing:Chip(label:Text(overview['syncStatus']?.toString()??'Not started')))),
        const SizedBox(height:12),
        Wrap(spacing:12,runSpacing:12,children:[
          SizedBox(width:190,child:_statusCard('Managed endpoints','${devices.length}',Icons.devices)),
          SizedBox(width:190,child:_statusCard('Detections (7 days)','${detections.length}',Icons.shield_outlined)),
          SizedBox(width:190,child:_statusCard('Data status',overview['partial']==true?'Partial':'Bounded',Icons.fact_check_outlined))
        ]),
        const SizedBox(height:18),
        Text('Managed endpoints',style:Theme.of(context).textTheme.titleMedium),
        if(devices.isEmpty)const ListTile(title:Text('No devices synced yet')),
        for(final d in devices)ListTile(
          leading:const Icon(Icons.computer),title:Text(d['name']?.toString()??'Device'),
          subtitle:Text(d['id']?.toString()??''),
          trailing:Text(d['protection']?.toString()??'Unknown')),
        const SizedBox(height:16),
        Text('Recent detections',style:Theme.of(context).textTheme.titleMedium),
        if(detections.isEmpty)const ListTile(title:Text('No detection records synced yet')),
        for(final d in detections)ListTile(
          leading:const Icon(Icons.warning_amber_outlined),
          title:Text(d['name']?.toString()??'Detection'),
          subtitle:Text(d['occurredAt']?.toString()??'Unknown time'),
          trailing:Text(d['severity']?.toString()??'Unknown')),
        const SizedBox(height:20),
        Row(children:[
          Expanded(child:Text('Operations awaiting review',style:Theme.of(context).textTheme.titleMedium)),
          OutlinedButton.icon(onPressed:connected?requestReview:null,
            icon:const Icon(Icons.add),label:const Text('Request review'))
        ]),
        if(operations.isEmpty)const ListTile(title:Text('No operations requested')),
        for(final op in operations)ListTile(
          leading:const Icon(Icons.rule_folder_outlined),
          title:Text(op['kind']?.toString()??'Operation'),
          subtitle:Text(op['reason']?.toString()??''),
          trailing:Text(op['status']?.toString()??'')),
        const SizedBox(height:16),
        const Text('Operator approval is required to bind ESET tenants or run a provider synchronisation. This screen never receives provider API keys, tokens, or sensitive event payloads.')
      ])
    );
  }
}
