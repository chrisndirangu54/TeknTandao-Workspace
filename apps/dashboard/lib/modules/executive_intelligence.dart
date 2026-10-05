import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../suite.dart';

class ExecutiveIntelligencePanel extends StatefulWidget {
  final SuiteStore store;
  const ExecutiveIntelligencePanel({super.key, required this.store});
  @override State<ExecutiveIntelligencePanel> createState()=>_ExecutiveIntelligencePanelState();
}

class _ExecutiveIntelligencePanelState extends State<ExecutiveIntelligencePanel>{
  Map<String,dynamic>? data;
  List<Map<String,dynamic>> connections=const [];
  bool busy=true, aiBusy=false;
  String? error;

  @override void initState(){super.initState();load();}

  Future<void> load() async{
    setState((){busy=true;error=null;});
    try{
      final values=await Future.wait([
        widget.store.call('getExecutiveIntelligence'),
        widget.store.call('getAutomationStudio'),
      ]);
      final next=values[0];
      final studio=values[1];
      if(mounted)setState((){
        data=next;
        connections=_rows(studio['connections']);
      });
    }catch(e){if(mounted)setState(()=>error=e.toString());}
    finally{if(mounted)setState(()=>busy=false);}
  }

  Future<void> aiBrief() async{
    if(aiBusy)return;
    setState(()=>aiBusy=true);
    try{
      final result=await widget.store.call('generateExecutiveBrief',{'useAi':true});
      if(!mounted)return;
      await showDialog<void>(context:context,builder:(ctx)=>AlertDialog(
        title:Text((result['headline']??'Executive brief').toString()),
        content:SizedBox(width:720,child:SingleChildScrollView(child:Column(
          crossAxisAlignment:CrossAxisAlignment.start,
          children:[
            Text((result['summary']??'').toString(),style:const TextStyle(height:1.5)),
            const SizedBox(height:16),
            const Text('Recommendations',style:TextStyle(fontWeight:FontWeight.w800)),
            for(final item in _rows(result['recommendations']))
              ListTile(
                contentPadding:EdgeInsets.zero,
                leading:Icon(_priorityIcon(item['priority']),color:_priorityColor(item['priority'])),
                title:Text((item['title']??'').toString(),style:const TextStyle(fontWeight:FontWeight.w700)),
                subtitle:Text((item['reason']??'').toString()+'\\n'+(item['action']??'').toString()),
              ),
          ],
        ))),
        actions:[FilledButton(onPressed:()=>Navigator.pop(ctx),child:const Text('Done'))],
      ));
    }catch(e){if(mounted)setState(()=>error=e.toString());}
    finally{if(mounted)setState(()=>aiBusy=false);}
  }


  Future<Map<String,dynamic>?> createExport(String format) async {
    try {
      final result = await widget.store.call(
        'exportExecutiveIntelligence',
        {'format': format},
      );
      if (!mounted) return result;
      final opened = await launchUrl(
        Uri.parse(result['url'].toString()),
        webOnlyWindowName: '_blank',
      );
      if (!opened) {
        throw StateError('Could not open the generated export.');
      }
      return result;
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
      return null;
    }
  }

  Future<void> exportMenu() async {
    final format = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Wrap(
          children: [
            const ListTile(
              title: Text(
                'Export Executive Intelligence',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
              subtitle: Text(
                'Generate from the same bounded facts shown in this dashboard.',
              ),
            ),
            for (final item in const [
              ('pptx', 'PowerPoint (.pptx)', Icons.slideshow_rounded),
              ('xlsx', 'Excel (.xlsx)', Icons.table_chart_rounded),
              ('csv', 'CSV (.csv)', Icons.grid_on_rounded),
              ('pdf', 'PDF (.pdf)', Icons.picture_as_pdf_rounded),
              ('docx', 'Word (.docx)', Icons.description_rounded),
            ])
              ListTile(
                leading: Icon(item.$3),
                title: Text(item.$2),
                onTap: () => Navigator.pop(ctx, item.$1),
              ),
          ],
        ),
      ),
    );
    if (format != null) await createExport(format);
  }

  Future<void> publishToMicrosoft365() async {
    final available = connections
        .where((item) =>
            item['status'] == 'connected' &&
            item['provider'] == 'microsoft365')
        .toList();
    if (available.isEmpty) {
      setState(
        () => error =
            'Connect Microsoft 365 in Automation Studio before publishing Office exports.',
      );
      return;
    }
    var connectionId = available.first['id'].toString();
    var format = 'pptx';
    final folderController =
        TextEditingController(text: 'TeknTandao Exports');
    final approved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Publish to Microsoft 365'),
          content: SizedBox(
            width: 520,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: connectionId,
                  decoration:
                      const InputDecoration(labelText: 'Microsoft connection'),
                  items: [
                    for (final item in available)
                      DropdownMenuItem(
                        value: item['id'].toString(),
                        child: Text(item['name'].toString()),
                      ),
                  ],
                  onChanged: (value) => setDialogState(() {
                    if (value != null) connectionId = value;
                  }),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: format,
                  decoration:
                      const InputDecoration(labelText: 'Export format'),
                  items: const [
                    DropdownMenuItem(
                      value: 'pptx',
                      child: Text('PowerPoint (.pptx)'),
                    ),
                    DropdownMenuItem(
                      value: 'xlsx',
                      child: Text('Excel (.xlsx)'),
                    ),
                    DropdownMenuItem(
                      value: 'docx',
                      child: Text('Word (.docx)'),
                    ),
                    DropdownMenuItem(
                      value: 'pdf',
                      child: Text('PDF (.pdf)'),
                    ),
                    DropdownMenuItem(
                      value: 'csv',
                      child: Text('CSV (.csv)'),
                    ),
                  ],
                  onChanged: (value) => setDialogState(() {
                    if (value != null) format = value;
                  }),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: folderController,
                  decoration:
                      const InputDecoration(labelText: 'OneDrive folder'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Generate & publish'),
            ),
          ],
        ),
      ),
    );
    if (approved != true) {
      folderController.dispose();
      return;
    }

    try {
      final created = await widget.store.call(
        'exportExecutiveIntelligence',
        {'format': format},
      );
      final result = await widget.store.call(
        'publishAnalyticsExportToMicrosoft365',
        {
          'connectionId': connectionId,
          'exportId': created['id'],
          'folder': folderController.text.trim(),
        },
      );
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Published to Microsoft 365'),
          content: SelectableText(
            (result['webUrl'] ?? result['name'] ?? 'Published').toString(),
          ),
          actions: [
            if ((result['webUrl'] ?? '').toString().isNotEmpty)
              FilledButton(
                onPressed: () async {
                  await launchUrl(
                    Uri.parse(result['webUrl'].toString()),
                    webOnlyWindowName: '_blank',
                  );
                  if (ctx.mounted) Navigator.pop(ctx);
                },
                child: const Text('Open file'),
              ),
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Close'),
            ),
          ],
        ),
      );
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      folderController.dispose();
    }
  }

  Future<void> publishToPowerBi() async {
    final available = connections
        .where((item) =>
            item['status'] == 'connected' &&
            item['provider'] == 'powerbi')
        .toList();
    if (available.isEmpty) {
      setState(
        () => error =
            'Connect Power BI in Automation Studio before publishing KPI snapshots.',
      );
      return;
    }
    var connectionId = available.first['id'].toString();
    final dataset = TextEditingController();
    final group = TextEditingController();
    final table = TextEditingController(text: 'TeknTandaoKPI');
    final approved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Publish KPI snapshot to Power BI'),
          content: SizedBox(
            width: 540,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: connectionId,
                  decoration:
                      const InputDecoration(labelText: 'Power BI connection'),
                  items: [
                    for (final item in available)
                      DropdownMenuItem(
                        value: item['id'].toString(),
                        child: Text(item['name'].toString()),
                      ),
                  ],
                  onChanged: (value) => setDialogState(() {
                    if (value != null) connectionId = value;
                  }),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: dataset,
                  decoration: const InputDecoration(
                    labelText: 'Semantic model / dataset UUID',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: group,
                  decoration: const InputDecoration(
                    labelText: 'Workspace UUID (optional)',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: table,
                  decoration: const InputDecoration(
                    labelText: 'Push table name',
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Expected table columns: Metric (text), Value (number), GeneratedAt (text/date).',
                  style: TextStyle(
                    color: Color(0xFF64748B),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Publish'),
            ),
          ],
        ),
      ),
    );
    if (approved == true) {
      try {
        final result = await widget.store.call(
          'publishExecutiveSnapshotToPowerBi',
          {
            'connectionId': connectionId,
            'datasetId': dataset.text.trim(),
            if (group.text.trim().isNotEmpty)
              'groupId': group.text.trim(),
            'tableName': table.text.trim(),
          },
        );
        if (mounted) {
          await showDialog<void>(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Text('Published to Power BI'),
              content: Text(
                'Pushed ' +
                    result['rowCount'].toString() +
                    ' KPI rows at ' +
                    result['generatedAt'].toString() +
                    '.',
              ),
              actions: [
                FilledButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Done'),
                ),
              ],
            ),
          );
        }
      } catch (e) {
        if (mounted) setState(() => error = e.toString());
      }
    }
    dataset.dispose();
    group.dispose();
    table.dispose();
  }

  @override Widget build(BuildContext context){
    if(busy)return const Center(child:Padding(padding:EdgeInsets.all(32),child:CircularProgressIndicator()));
    if(error!=null&&data==null)return Center(child:Column(mainAxisSize:MainAxisSize.min,children:[
      const Icon(Icons.insights_rounded,size:48),const SizedBox(height:10),Text(error!,textAlign:TextAlign.center),
      const SizedBox(height:12),FilledButton.icon(onPressed:load,icon:const Icon(Icons.refresh),label:const Text('Retry')),
    ]));
    final facts=_map(data?['facts']);
    final sales=_map(facts['sales']), inventory=_map(facts['inventory']), customers=_map(facts['customers']);
    final support=_map(facts['support']), projects=_map(facts['projects']), connectors=_map(facts['connectors']), apps=_map(facts['apps']);
    final recommendations=_rows(data?['recommendations']);

    return RefreshIndicator(onRefresh:load,child:ListView(
      padding:const EdgeInsets.only(bottom:80),
      children:[
        Container(
          padding:const EdgeInsets.all(24),
          decoration:BoxDecoration(
            gradient:const LinearGradient(colors:[Color(0xFF0F172A),Color(0xFF1D4ED8)]),
            borderRadius:BorderRadius.circular(24),
            boxShadow:const [BoxShadow(color:Color(0x220F172A),blurRadius:28,offset:Offset(0,10))],
          ),
          child:Wrap(spacing:18,runSpacing:14,crossAxisAlignment:WrapCrossAlignment.center,children:[
            SizedBox(width:430,child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              const Text('Executive Intelligence',style:TextStyle(color:Colors.white,fontSize:24,fontWeight:FontWeight.w900)),
              const SizedBox(height:6),
              Text((data?['status']?['overall']??'stable').toString()=='attention'
                ?'Operational exceptions need attention.'
                :'No high-priority deterministic exception is currently flagged.',
                style:const TextStyle(color:Color(0xFFDBEAFE),height:1.4)),
            ])),
            FilledButton.icon(
              onPressed:aiBusy?null:aiBrief,
              icon:aiBusy?const SizedBox(width:16,height:16,child:CircularProgressIndicator(strokeWidth:2)):const Icon(Icons.auto_awesome_rounded),
              label:Text(aiBusy?'Generating…':'AI management brief'),
            ),
            OutlinedButton.icon(style:OutlinedButton.styleFrom(foregroundColor:Colors.white),onPressed:exportMenu,icon:const Icon(Icons.download_rounded),label:const Text('Export')),
            OutlinedButton.icon(style:OutlinedButton.styleFrom(foregroundColor:Colors.white),onPressed:publishToMicrosoft365,icon:const Icon(Icons.cloud_upload_outlined),label:const Text('Microsoft 365')),
            OutlinedButton.icon(style:OutlinedButton.styleFrom(foregroundColor:Colors.white),onPressed:publishToPowerBi,icon:const Icon(Icons.bar_chart_rounded),label:const Text('Power BI')),
            OutlinedButton.icon(style:OutlinedButton.styleFrom(foregroundColor:Colors.white),onPressed:load,icon:const Icon(Icons.refresh),label:const Text('Refresh')),
          ]),
        ),
        const SizedBox(height:18),
        LayoutBuilder(builder:(context,constraints){
          final columns=constraints.maxWidth>=1100?4:constraints.maxWidth>=700?2:1;
          final width=(constraints.maxWidth-(columns-1)*12)/columns;
          final cards=<Widget>[
            _Kpi('Recorded sales',kes(_int(sales['valueMinor'])),_int(sales['count']).toString()+' bounded records',Icons.trending_up_rounded),
            _Kpi('Inventory',_int(inventory['skuCount']).toString()+' SKUs',_int(inventory['lowStock']).toString()+' low · '+_int(inventory['outOfStock']).toString()+' out',Icons.inventory_2_rounded),
            _Kpi('Customers',_int(customers['contacts']).toString(),'CRM contacts',Icons.groups_rounded),
            _Kpi('Open support',_int(support['open']).toString(),_int(support['highPriorityOpen']).toString()+' high priority',Icons.support_agent_rounded),
            _Kpi('Overdue projects',_int(projects['overdue']).toString(),_int(projects['total']).toString()+' bounded records',Icons.flag_rounded),
            _Kpi('Connected systems',_int(connectors['connected']).toString(),_int(connectors['healthy']).toString()+' healthy · '+_int(connectors['degraded']).toString()+' degraded',Icons.hub_rounded),
            _Kpi('Apps installed',_int(apps['installed']).toString(),_int(apps['paid']).toString()+' paid · '+_int(apps['trial']).toString()+' trial',Icons.apps_rounded),
            _Kpi('Sync impact',(_int(connectors['recordsCreated'])+_int(connectors['recordsUpdated'])).toString(),_int(connectors['recentRuns']).toString()+' recent runs',Icons.sync_alt_rounded),
          ];
          return Wrap(spacing:12,runSpacing:12,children:[for(final card in cards)SizedBox(width:width,child:card)]);
        }),
        const SizedBox(height:18),
        _chartPair(
          _AnalyticsCard(
            title:'Recorded sales trend',
            subtitle:'Six-month bounded series; recorded sales are not collected cash.',
            child:_InteractiveLineChart(
              data:_rows(sales['series']).map((row)=>_Point(row['period'].toString(),_double(row['value']))).toList(),
              valueLabel:(value)=>kes(value.round()),
            ),
          ),
          _AnalyticsCard(
            title:'Inventory health',
            subtitle:'Healthy, low-stock and out-of-stock SKU tallies.',
            child:_InteractiveBarChart(data:_rows(inventory['stockHealth']).map((row)=>_Point(row['label'].toString(),_double(row['value']))).toList()),
          ),
        ),
        const SizedBox(height:18),
        _chartPair(
          _AnalyticsCard(
            title:'Support status',
            subtitle:'Ticket distribution by stored status.',
            child:_InteractiveBarChart(data:_rows(support['status']).take(8).map((row)=>_Point(row['label'].toString(),_double(row['value']))).toList()),
          ),
          _AnalyticsCard(
            title:'Connector footprint',
            subtitle:'Connection records grouped by provider.',
            child:_InteractiveBarChart(data:_rows(connectors['providers']).take(8).map((row)=>_Point(row['label'].toString(),_double(row['value']))).toList()),
          ),
        ),
        const SizedBox(height:18),
        _AnalyticsCard(
          title:'Intelligent recommendations',
          subtitle:'Deterministic recommendations based only on measured workspace facts.',
          child:recommendations.isEmpty?const Center(child:Text('No recommendations available.')):ListView(
            physics:const NeverScrollableScrollPhysics(),
            children:[for(final item in recommendations)ListTile(
              contentPadding:EdgeInsets.zero,
              leading:CircleAvatar(
                backgroundColor:_priorityColor(item['priority']).withValues(alpha:.12),
                child:Icon(_priorityIcon(item['priority']),color:_priorityColor(item['priority'])),
              ),
              title:Text((item['title']??'').toString(),style:const TextStyle(fontWeight:FontWeight.w800)),
              subtitle:Text((item['reason']??'').toString()+'\\n'+(item['action']??'').toString()),
              trailing:Chip(label:Text((item['source']??'system').toString())),
            )],
          ),
        ),
        const SizedBox(height:10),
        const Text(
          'Analytics are bounded operational views. Connector data becomes canonical only through approved Data Exchange rules.',
          style:TextStyle(color:Color(0xFF64748B),fontSize:12),
        ),
      ],
    ));
  }

  Widget _chartPair(Widget left,Widget right)=>LayoutBuilder(builder:(context,constraints){
    if(constraints.maxWidth<900)return Column(children:[left,const SizedBox(height:12),right]);
    return Row(crossAxisAlignment:CrossAxisAlignment.start,children:[Expanded(child:left),const SizedBox(width:12),Expanded(child:right)]);
  });
}

class _Kpi extends StatelessWidget{
  final String title,value,detail;final IconData icon;
  const _Kpi(this.title,this.value,this.detail,this.icon);
  @override Widget build(BuildContext context)=>Container(
    padding:const EdgeInsets.all(18),
    decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(18),border:Border.all(color:const Color(0xFFE5E7EB)),boxShadow:const [BoxShadow(color:Color(0x0D0F172A),blurRadius:18,offset:Offset(0,6))]),
    child:Row(children:[
      Container(padding:const EdgeInsets.all(11),decoration:BoxDecoration(color:const Color(0xFFDBEAFE),borderRadius:BorderRadius.circular(13)),child:Icon(icon,color:const Color(0xFF1D4ED8))),
      const SizedBox(width:12),
      Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(title,style:const TextStyle(color:Color(0xFF64748B),fontSize:12)),
        const SizedBox(height:3),Text(value,style:const TextStyle(fontWeight:FontWeight.w900,fontSize:21)),
        const SizedBox(height:2),Text(detail,style:const TextStyle(color:Color(0xFF64748B),fontSize:11)),
      ])),
    ]),
  );
}

class _AnalyticsCard extends StatelessWidget{
  final String title,subtitle;final Widget child;
  const _AnalyticsCard({required this.title,required this.subtitle,required this.child});
  @override Widget build(BuildContext context)=>Container(
    padding:const EdgeInsets.all(20),
    decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(20),border:Border.all(color:const Color(0xFFE5E7EB)),boxShadow:const [BoxShadow(color:Color(0x0D0F172A),blurRadius:18,offset:Offset(0,6))]),
    child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Text(title,style:const TextStyle(fontWeight:FontWeight.w900,fontSize:17)),
      const SizedBox(height:3),Text(subtitle,style:const TextStyle(color:Color(0xFF64748B),fontSize:12)),
      const SizedBox(height:18),SizedBox(height:220,child:child),
    ]),
  );
}

class _Point{final String label;final double value;const _Point(this.label,this.value);}

class _InteractiveBarChart extends StatefulWidget{
  final List<_Point> data;const _InteractiveBarChart({required this.data});
  @override State<_InteractiveBarChart> createState()=>_InteractiveBarChartState();
}
class _InteractiveBarChartState extends State<_InteractiveBarChart>{
  int? selected;
  @override Widget build(BuildContext context){
    if(widget.data.isEmpty)return const Center(child:Text('No chart data.'));
    return LayoutBuilder(builder:(context,constraints)=>GestureDetector(
      behavior:HitTestBehavior.opaque,
      onTapDown:(details){
        final index=((details.localPosition.dx/math.max(1,constraints.maxWidth))*widget.data.length).floor().clamp(0,widget.data.length-1);
        setState(()=>selected=index);
      },
      child:Column(children:[
        if(selected!=null)Align(alignment:Alignment.centerLeft,child:Chip(label:Text(widget.data[selected!].label+': '+widget.data[selected!].value.round().toString()))),
        Expanded(child:CustomPaint(size:Size.infinite,painter:_BarPainter(widget.data,selected))),
      ]),
    ));
  }
}

class _InteractiveLineChart extends StatefulWidget{
  final List<_Point> data;final String Function(double) valueLabel;
  const _InteractiveLineChart({required this.data,required this.valueLabel});
  @override State<_InteractiveLineChart> createState()=>_InteractiveLineChartState();
}
class _InteractiveLineChartState extends State<_InteractiveLineChart>{
  int? selected;
  @override Widget build(BuildContext context){
    if(widget.data.isEmpty)return const Center(child:Text('No chart data.'));
    return LayoutBuilder(builder:(context,constraints)=>GestureDetector(
      behavior:HitTestBehavior.opaque,
      onTapDown:(details){
        final width=math.max(1.0,constraints.maxWidth-20);
        final fraction=((details.localPosition.dx-10)/width).clamp(0.0,1.0);
        setState(()=>selected=(fraction*(widget.data.length-1)).round());
      },
      child:Column(children:[
        if(selected!=null)Align(alignment:Alignment.centerLeft,child:Chip(label:Text(widget.data[selected!].label+': '+widget.valueLabel(widget.data[selected!].value)))),
        Expanded(child:CustomPaint(size:Size.infinite,painter:_LinePainter(widget.data,selected))),
      ]),
    ));
  }
}

class _BarPainter extends CustomPainter{
  final List<_Point> data;final int? selected;const _BarPainter(this.data,this.selected);
  @override void paint(Canvas canvas,Size size){
    final maxValue=math.max(1.0,data.map((e)=>e.value).fold(0.0,math.max));
    final baseline=size.height-32, slot=size.width/data.length;
    final paint=Paint()..color=const Color(0xFF2563EB), selectedPaint=Paint()..color=const Color(0xFF7C3AED);
    final label=TextPainter(textDirection:TextDirection.ltr,maxLines:1,ellipsis:'…');
    for(var i=0;i<data.length;i++){
      final barWidth=math.min(42.0,slot*.58),height=(data[i].value/maxValue)*math.max(20,baseline-16),left=slot*i+(slot-barWidth)/2;
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(left,baseline-height,barWidth,height),const Radius.circular(8)),i==selected?selectedPaint:paint);
      label.text=TextSpan(text:data[i].label,style:const TextStyle(color:Color(0xFF64748B),fontSize:9));
      label.layout(maxWidth:math.max(20,slot-4));
      label.paint(canvas,Offset(slot*i+(slot-label.width)/2,baseline+7));
    }
  }
  @override bool shouldRepaint(_BarPainter old)=>old.data!=data||old.selected!=selected;
}

class _LinePainter extends CustomPainter{
  final List<_Point> data;final int? selected;const _LinePainter(this.data,this.selected);
  @override void paint(Canvas canvas,Size size){
    final values=data.map((e)=>e.value).toList(),maxValue=math.max(1.0,values.reduce(math.max)),minValue=values.reduce(math.min),spread=math.max(1.0,maxValue-minValue);
    const left=10.0,top=12.0;final right=math.max(left+1,size.width-10),bottom=size.height-28;
    final line=Paint()..color=const Color(0xFF2563EB)..strokeWidth=3..style=PaintingStyle.stroke;
    final dot=Paint()..color=const Color(0xFF2563EB),selectedDot=Paint()..color=const Color(0xFF7C3AED),path=Path();
    for(var i=0;i<data.length;i++){
      final x=data.length==1?(left+right)/2:left+(right-left)*i/(data.length-1),y=bottom-((data[i].value-minValue)/spread)*(bottom-top);
      if(i==0)path.moveTo(x,y);else path.lineTo(x,y);
    }
    canvas.drawPath(path,line);
    final label=TextPainter(textDirection:TextDirection.ltr,maxLines:1);
    for(var i=0;i<data.length;i++){
      final x=data.length==1?(left+right)/2:left+(right-left)*i/(data.length-1),y=bottom-((data[i].value-minValue)/spread)*(bottom-top);
      canvas.drawCircle(Offset(x,y),i==selected?6:4,i==selected?selectedDot:dot);
      label.text=TextSpan(text:data[i].label,style:const TextStyle(color:Color(0xFF64748B),fontSize:9));label.layout();
      label.paint(canvas,Offset((x-label.width/2).clamp(0.0,math.max(0.0,size.width-label.width)),bottom+8));
    }
  }
  @override bool shouldRepaint(_LinePainter old)=>old.data!=data||old.selected!=selected;
}

Map<String,dynamic> _map(dynamic value)=>value is Map?Map<String,dynamic>.from(value):<String,dynamic>{};
List<Map<String,dynamic>> _rows(dynamic value)=>(value as List? ?? const []).whereType<Map>().map((item)=>Map<String,dynamic>.from(item)).toList();
int _int(dynamic value)=>(value as num?)?.round()??0;
double _double(dynamic value)=>(value as num?)?.toDouble()??0;
Color _priorityColor(dynamic priority)=>switch(priority.toString()){'high'=>const Color(0xFFDC2626),'medium'=>const Color(0xFFD97706),_=>const Color(0xFF059669)};
IconData _priorityIcon(dynamic priority)=>switch(priority.toString()){'high'=>Icons.priority_high_rounded,'medium'=>Icons.warning_amber_rounded,_=>Icons.check_circle_outline_rounded};
