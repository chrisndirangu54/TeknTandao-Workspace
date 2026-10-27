import 'package:flutter/material.dart';
import '../suite.dart';

class FinanceAgentScreen extends StatefulWidget {
 final SuiteStore store;
 const FinanceAgentScreen({super.key,required this.store});
 @override State<FinanceAgentScreen> createState()=>_FinanceAgentScreenState();
}
class _FinanceAgentScreenState extends State<FinanceAgentScreen>{
 final prompt=TextEditingController(text:'Which overdue invoices and reconciliation exceptions need review first?');
 Map<String,dynamic>? report;
 String? summary,error;
 bool busy=false;
 @override void initState(){super.initState();refresh();}
 @override void dispose(){prompt.dispose();super.dispose();}
 Future<void> refresh()async{
  if(busy)return;
  setState(()=>busy=true);
  try{
   final result=await widget.store.call('getFinanceAgentSummary',{});
   if(mounted)setState(()=>{report=Map<String,dynamic>.from(result),summary=null,error=null});
  }catch(e){if(mounted)setState(()=>error=e.toString());}
  finally{if(mounted)setState(()=>busy=false);}
 }
 Future<void> explain()async{
  if(busy)return;
  setState(()=>busy=true);
  try{
   final result=await widget.store.call('explainFinanceAgentSummary',{'prompt':prompt.text.trim()});
   if(mounted)setState(()=>{summary=result['summary']?.toString(),error=null});
  }catch(e){if(mounted)setState(()=>error=e.toString());}
  finally{if(mounted)setState(()=>busy=false);}
 }
 @override Widget build(BuildContext context)=>Scaffold(
  appBar:AppBar(title:const Text('Finance Agent')),
  body:ListView(padding:const EdgeInsets.all(20),children:[
   const Text('Read-only invoice & reconciliation intelligence',style:TextStyle(fontSize:21,fontWeight:FontWeight.bold)),
   const SizedBox(height:8),
   const Text('Invoice balances are not bank-confirmed collections. Financial discrepancies need human review; this agent cannot post journals, refund payments or contact customers.'),
   if(busy)const LinearProgressIndicator(),
   if(error!=null)Text(error!,style:TextStyle(color:Theme.of(context).colorScheme.error)),
   if(report!=null)...[
    const SizedBox(height:12),
    Wrap(spacing:18,runSpacing:12,children:[
     Chip(label:Text('Outstanding: ${report!['totalOutstandingMinor']} KES minor units')),
     Chip(label:Text('Overdue: ${report!['overdueMinor']} KES minor units')),
     Chip(label:Text('Discrepancies: ${report!['discrepancyCount']}')),
    ]),
    if(report!['integrityOk']!=true)const Text('Financial consistency exceptions detected. Do not treat this report as reconciled.'),
    for(final item in (report!['discrepancies'] as List? ?? const []))
      ListTile(leading:const Icon(Icons.warning_amber),title:Text((item as Map)['code']?.toString()??'Issue'),
       subtitle:Text(item.toString())),
    const Text('Outstanding invoices',style:TextStyle(fontSize:17,fontWeight:FontWeight.bold)),
    for(final item in (report!['invoices'] as List? ?? const []))
      ListTile(title:Text('Invoice ${(item as Map)['invoiceId']}'),
       subtitle:Text('Outstanding: ${item['outstandingMinor']} minor units · ${item['overdue']==true?'Overdue':'Open'}')),
   ],
   const SizedBox(height:16),
   TextField(controller:prompt,maxLength:1000,maxLines:2,decoration:const InputDecoration(
    labelText:'Ask the Finance Agent',border:OutlineInputBorder())),
   Wrap(spacing:12,children:[
    FilledButton.icon(onPressed:busy?null:refresh,icon:const Icon(Icons.refresh),label:const Text('Refresh evidence')),
    OutlinedButton.icon(onPressed:busy?null:explain,icon:const Icon(Icons.auto_awesome),label:const Text('Explain with AI')),
   ]),
   if(summary!=null)Card(child:Padding(padding:const EdgeInsets.all(16),child:SelectableText(summary!))),
  ]),
 );
}
