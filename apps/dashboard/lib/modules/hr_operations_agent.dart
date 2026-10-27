import 'package:flutter/material.dart';
import '../suite.dart';

class HrOperationsAgentScreen extends StatefulWidget {
 final SuiteStore store;
 const HrOperationsAgentScreen({super.key,required this.store});
 @override State<HrOperationsAgentScreen> createState()=>_HrOperationsAgentScreenState();
}
class _HrOperationsAgentScreenState extends State<HrOperationsAgentScreen>{
 final prompt=TextEditingController(text:'Summarize attendance exceptions and leave requests that need management review.');
 late String month;
 Map<String,dynamic>? report;
 String? summary,error;
 bool busy=false;
 @override void initState(){
  super.initState();
  final now=DateTime.now();
  month='${now.year}-${now.month.toString().padLeft(2,'0')}';
  refresh();
 }
 @override void dispose(){prompt.dispose();super.dispose();}
 Future<void> refresh()async{
  if(busy)return;
  setState(()=>busy=true);
  try{
   final response=await widget.store.call('getHrOperationsAgentSummary',{'month':month});
   if(mounted)setState((){report=Map<String,dynamic>.from(response);summary=null;error=null;});
  }catch(e){if(mounted)setState(()=>error=e.toString());}
  finally{if(mounted)setState(()=>busy=false);}
 }
 Future<void> explain()async{
  if(busy)return;
  setState(()=>busy=true);
  try{
   final response=await widget.store.call('explainHrOperationsAgentSummary',{
    'month':month,'prompt':prompt.text.trim()});
   if(mounted)setState((){summary=response['summary']?.toString();error=null;});
  }catch(e){if(mounted)setState(()=>error=e.toString());}
  finally{if(mounted)setState(()=>busy=false);}
 }
 @override Widget build(BuildContext context)=>Scaffold(
  appBar:AppBar(title:const Text('HR Operations Agent')),
  body:ListView(padding:const EdgeInsets.all(20),children:[
   const Text('Attendance & leave intelligence',style:TextStyle(fontSize:22,fontWeight:FontWeight.bold)),
   const SizedBox(height:8),
   const Text('Management review only. Missing checkouts are not proof of absence. This agent cannot change employee records, approve leave or run payroll.'),
   Text('Reporting month: $month'),
   if(busy)const LinearProgressIndicator(),
   if(error!=null)Text(error!,style:TextStyle(color:Theme.of(context).colorScheme.error)),
   if(report!=null)...[
    const SizedBox(height:16),
    Text('Attendance: ${(report!['attendance'] as Map?)?['recordedPunches']??0} recorded punch days'),
    Text('Missing checkouts: ${(report!['attendance'] as Map?)?['missingCheckoutCount']??0}'),
    Text('Leave requests: ${(report!['leave'] as Map?)?['requestCount']??0}'),
    const SizedBox(height:12),
    const Text('Exceptions for manager review',style:TextStyle(fontWeight:FontWeight.bold)),
    for(final item in (report!['exceptions'] as List? ?? const []))
     ListTile(leading:const Icon(Icons.info_outline),
      title:Text((item as Map)['type']?.toString()??'Exception'),
      subtitle:Text('Record: ${item['recordId']??'unknown'}')),
   ],
   const SizedBox(height:18),
   TextField(controller:prompt,maxLength:1000,maxLines:2,
    decoration:const InputDecoration(labelText:'Ask the HR Operations Agent',border:OutlineInputBorder())),
   Wrap(spacing:12,children:[
    FilledButton.icon(onPressed:busy?null:refresh,icon:const Icon(Icons.refresh),label:const Text('Refresh summary')),
    OutlinedButton.icon(onPressed:busy?null:explain,icon:const Icon(Icons.auto_awesome),label:const Text('Explain with AI')),
   ]),
   if(summary!=null)Card(child:Padding(padding:const EdgeInsets.all(16),child:SelectableText(summary!))),
  ]),
 );
}
