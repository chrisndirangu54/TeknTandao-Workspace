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
  @override
  void initState() {super.initState();refresh();}
  Future<void> refresh() async {
    if (widget.store.demo) {
      setState(() {error='ESET data is unavailable in preview mode. Connect an approved tenant in production.';});
      return;
    }
    setState(() {loading=true;error=null;});
    try {
      final result=await widget.store.call('getEsetSecurityOverview');
      if (!mounted) return;
      setState(() {
        overview=result;
        devices=(result['devices'] as List? ?? []).map((e)=>Map<String,dynamic>.from(e as Map)).toList();
        detections=(result['detections'] as List? ?? []).map((e)=>Map<String,dynamic>.from(e as Map)).toList();
      });
    } catch (_) {
      if(mounted)setState(()=>error='Unable to retrieve security data. Check tenant access and deployment.');
    } finally {
      if(mounted)setState(()=>loading=false);
    }
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
        const SizedBox(height:16),
        const Text('Operator approval is required to bind ESET tenants or run a provider synchronisation. This screen never receives provider API keys, tokens, or sensitive event payloads.')
      ])
    );
  }
}
