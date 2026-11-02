import 'package:flutter/material.dart';
import '../suite.dart';

// Workspace Analytics -> Kenya Open Data. Data comes from the server, never sample values.
class KenyaOpenDataModuleScreen extends StatefulWidget {
  final SuiteStore store;
  const KenyaOpenDataModuleScreen({super.key,required this.store});
  @override
  State<KenyaOpenDataModuleScreen> createState()=>_KenyaOpenDataModuleScreenState();
}
class _KenyaOpenDataModuleScreenState extends State<KenyaOpenDataModuleScreen> {
  List<Map<String,dynamic>> datasets=[];
  Map<String,dynamic>? response;
  String? selectedId;
  String? error;
  bool busy=false;
  @override
  void initState() {super.initState();_loadCatalog();}
  Future<void> _loadCatalog() async {
    if(widget.store.demo) {
      setState(()=>error='Demo workspace: connect to Firebase to browse live indicators.');
      return;
    }
    setState((){busy=true;error=null;});
    try {
      final data=await widget.store.call('getKenyaOpenDataCatalog');
      final entries=(data['datasets'] as List? ?? const [])
        .whereType<Map>().map((v)=>Map<String,dynamic>.from(v)).toList();
      if(!mounted)return;
      setState((){
        datasets=entries;
        selectedId=entries.isEmpty?null:entries.first['id']?.toString();
        busy=false;
      });
      if(selectedId!=null) await _loadDataset();
    } catch (_) {
      if(mounted)setState((){busy=false;error='Cannot load source catalogue. Check access and network.';});
    }
  }
  Future<void> _loadDataset() async {
    if(selectedId==null || busy)return;
    setState((){busy=true;error=null;response=null;});
    try {
      final result=await widget.store.call('getKenyaOpenDataDataset',{
        'datasetId':selectedId,'maxPoints':25
      });
      if(mounted)setState((){response=result;busy=false;});
    } catch (_) {
      if(mounted)setState((){
        busy=false;error='Source unavailable. Check network and Workspace membership.';
      });
    }
  }
  Widget _note(String value)=>Padding(
    padding:const EdgeInsets.only(top:8),
    child:Text(value,style:const TextStyle(color:Colors.black54,fontSize:13)));
  @override
  Widget build(BuildContext context) {
    final current=datasets.where((d)=>d['id']==selectedId).toList();
    final selected=current.isEmpty?null:current.first;
    final rows=(response?['series'] as List? ?? const []).whereType<Map>().toList();
    final latest=response?['latest'];
    return Scaffold(
      appBar:AppBar(title:const Text('Kenya Open Data Intelligence')),
      body:ListView(padding:const EdgeInsets.all(20),children:[
        const Text('Public-data source registry',style:TextStyle(fontSize:21,fontWeight:FontWeight.w700)),
        _note('National indicators are not county statistics or parcel valuations. Check licensing before commercial reuse.'),
        const SizedBox(height:18),
        if(datasets.isNotEmpty) DropdownButtonFormField<String>(
          value:selectedId,
          isExpanded:true,
          decoration:const InputDecoration(labelText:'Dataset'),
          items:datasets.map((d)=>DropdownMenuItem<String>(
            value:d['id']?.toString(),child:Text(d['title']?.toString()??'Unnamed dataset',
            overflow:TextOverflow.ellipsis))).toList(),
          onChanged:busy?null:(value){
            setState((){selectedId=value;response=null;});
            _loadDataset();
          },
        ),
        const SizedBox(height:12),
        Row(children:[
          FilledButton.icon(onPressed:busy||selectedId==null?null:_loadDataset,
            icon:const Icon(Icons.refresh),label:const Text('Refresh indicator')),
          if(busy)...[const SizedBox(width:14),const CircularProgressIndicator()],
        ]),
        if(error!=null)...[const SizedBox(height:14),Text(error!,
          style:TextStyle(color:Theme.of(context).colorScheme.error))],
        if(selected!=null)...[
          const SizedBox(height:16),
          Text('Source: '+selected['sourceId'].toString()+' • '+selected['geography'].toString()),
          _note(selected['warning']?.toString()??''),
          _note('Commercial reuse: '+((selected['source'] as Map?)?['commercialUse']??'review').toString()),
        ],
        if(response!=null)...[
          const SizedBox(height:20),
          Text('Retrieved '+(response!['fetchedAt']??'unknown').toString(),
            style:Theme.of(context).textTheme.labelMedium),
          if(latest is Map)
            Card(child:Padding(padding:const EdgeInsets.all(16),child:Column(
              crossAxisAlignment:CrossAxisAlignment.start,children:[
                const Text('Most recent reported observation'),
                const SizedBox(height:4),
                Text(latest['value'].toString()+' '+(response!['unit']??'').toString(),
                  style:Theme.of(context).textTheme.headlineMedium),
                Text('Reference year: '+latest['year'].toString()),
              ]))),
          if(rows.isNotEmpty)
            Card(child:Padding(padding:const EdgeInsets.all(16),
              child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                const Text('Historical time series',style:TextStyle(fontWeight:FontWeight.bold)),
                const SizedBox(height:10),
                ...rows.take(25).map((r)=>Padding(
                  padding:const EdgeInsets.symmetric(vertical:5),
                  child:Row(mainAxisAlignment:MainAxisAlignment.spaceBetween,children:[
                    Text(r['year'].toString()),Text(r['value'].toString()),
                  ]))),
              ]))),
          if(response!['boundaryId']!=null)
            Card(child:Padding(padding:const EdgeInsets.all(16),
              child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                Text('Boundary dataset: '+response!['boundaryId'].toString()),
                _note('Year represented: '+(response!['boundaryYearRepresented']??'not specified').toString()),
                _note('GeoJSON metadata URL: '+(response!['downloadGeoJsonUrl']??'unavailable').toString()),
                _note('Administrative overlay only; not cadastral ownership.'),
              ]))),
          _note('Attribution: '+(response!['sourceName']??'').toString()+
            ' — '+(response!['license']??'').toString()),
        ],
      ]),
    );
  }
}
