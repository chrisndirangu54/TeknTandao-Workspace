import 'package:flutter/material.dart';
import '../suite.dart';

class ExecutiveAgentScreen extends StatefulWidget{
 final SuiteStore store;
 const ExecutiveAgentScreen({super.key,required this.store});
 @override State<ExecutiveAgentScreen> createState()=>_ExecutiveAgentScreenState();
}
class _ExecutiveAgentScreenState extends State<ExecutiveAgentScreen>{
 final prompt=TextEditingController(text:'Prepare an executive briefing with priorities, risks and suggested reviews.');
 final selected=<String>{'finance','sales','inventory','hr'};
 Map<String,dynamic>? report;
 String? explanation,error;
 bool busy=false;
 @override void dispose(){prompt.dispose();super.dispose();}
 Future<void> run({bool ai=false})async{
  if(busy||selected.isEmpty)return;
  setState(()=>busy=true);
  try{
   final result=await widget.store.call(ai?'explainExecutiveAgentBriefing':'getExecutiveAgentBriefing',{
    'sections':selected.toList(),if(ai)'prompt':prompt.text.trim()});
   if(!mounted)return;
   setState((){
    if(ai){explanation=result['summary']?.toString();}
    else{report=Map<String,dynamic>.from(result);explanation=null;}
    error=null;
   });
  }catch(e){if(mounted)setState(()=>error=e.toString());}
  finally{if(mounted)setState(()=>busy=false);}
 }
 @override Widget build(BuildContext context)=>Scaffold(
  appBar:AppBar(title:const Text('Executive Intelligence Agent')),
  body:ListView(padding:const EdgeInsets.all(20),children:[
   const Text('Cross-functional executive briefing',style:TextStyle(fontSize:22,fontWeight:FontWeight.bold)),
   const SizedBox(height:8),
   const Text('Select only reports you are authorized to review. The assistant offers analysis, not financial posting, HR decisions, or automated outreach.'),
   const SizedBox(height:12),
   Wrap(spacing:8,children:[
    for(final name in const ['finance','sales','inventory','hr'])
     FilterChip(label:Text(name.toUpperCase()),selected:selected.contains(name),
      onSelected:busy?null:(value)=>setState((){if(value){selected.add(name);}else{selected.remove(name);}report=null;explanation=null;}))
   ]),
   TextField(controller:prompt,maxLines:2,maxLength:1200,
    decoration:const InputDecoration(labelText:'Executive briefing objective',border:OutlineInputBorder())),
   Wrap(spacing:10,children:[
    FilledButton.icon(onPressed:busy||selected.isEmpty?null:()=>run(),
     icon:const Icon(Icons.analytics_outlined),label:const Text('Load report evidence')),
    OutlinedButton.icon(onPressed:busy||selected.isEmpty?null:()=>run(ai:true),
     icon:const Icon(Icons.auto_awesome),label:const Text('Generate AI briefing'))
   ]),
   if(busy)const LinearProgressIndicator(),
   if(error!=null)Text(error!,style:TextStyle(color:Theme.of(context).colorScheme.error)),
   if(report!=null)...[
    const SizedBox(height:12),
    Text(report!['complete']==true?'All selected report sections available':'One or more report sections unavailable',
      style:const TextStyle(fontWeight:FontWeight.bold)),
    for(final entry in (report!['coverage'] as Map? ?? {}).entries)
     ListTile(title:Text(entry.key.toString()),subtitle:Text(entry.value.toString())),
    const Text('Operational evidence',style:TextStyle(fontWeight:FontWeight.bold)),
    for(final entry in (report!['sections'] as Map? ?? {}).entries)
     Card(child:ListTile(title:Text(entry.key.toString().toUpperCase()),
       subtitle:SelectableText(entry.value.toString()))),
   ],
   if(explanation!=null)Card(child:Padding(padding:const EdgeInsets.all(16),
     child:SelectableText(explanation!))),
  ])
 );
}
