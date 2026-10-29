import 'package:flutter/material.dart';
import '../suite.dart';
import 'automation_studio.dart';
import 'reseller_onboarding_dashboard.dart';

class CloudAutomationScreen extends StatefulWidget {
 final SuiteStore store;
 const CloudAutomationScreen({super.key,required this.store});
 @override State<CloudAutomationScreen> createState()=>_CloudAutomationScreenState();
}
class _CloudAutomationScreenState extends State<CloudAutomationScreen>{
 final app=TextEditingController(),repo=TextEditingController(),budget=TextEditingController(text:'40');
 String stack='Flutter web',provider='Azure';
 Map<String,dynamic>? preview;
 List<dynamic> saved=[];
 String? error;
 bool busy=false;
 @override void initState(){super.initState();reload();}
 @override void dispose(){app.dispose();repo.dispose();budget.dispose();super.dispose();}
 Map<String,dynamic> get plan=>{
  'schemaVersion':1,'kind':'cloud-automation-migration-request',
  'appName':app.text.trim(),'repositoryUrl':repo.text.trim(),'stack':stack,
  'provider':provider,'monthlyBudgetUsd':double.tryParse(budget.text)??0,
  'mode':'planning-only','source':'tekntandao-html'
 };
 Future<void> reload() async{
  if(widget.store.demo)return;
  try{
   final r=await widget.store.call('listCloudAutomationPlans');
   if(mounted)setState(()=>saved=r['plans'] as List? ?? []);
  }catch(e){if(mounted)setState(()=>error=e.toString());}
 }
 Future<void> execute(String action)async{
  if(busy)return;
  setState((){busy=true;error=null;});
  try{
   final result=await widget.store.call(action,{'plan':plan});
   if(mounted)setState(()=>preview=result);
   if(action=='importCloudAutomationPlan')await reload();
  }catch(e){if(mounted)setState(()=>error=e.toString());}
  finally{if(mounted)setState(()=>busy=false);}
 }
 void open(Widget screen)=>Navigator.of(context).push(MaterialPageRoute<void>(builder:(_)=>screen));
 @override Widget build(BuildContext context)=>Scaffold(
 appBar:AppBar(title:const Text('AI-assisted cloud automation'),actions:[
  IconButton(tooltip:'Automation Studio',icon:const Icon(Icons.auto_awesome),onPressed:()=>open(AutomationStudio(store:widget.store))),
  IconButton(tooltip:'Microsoft reseller onboarding',icon:const Icon(Icons.storefront),onPressed:()=>open(ResellerOnboardingDashboard(store:widget.store))),
 ]),
 body:ListView(padding:const EdgeInsets.all(20),children:[
  const Text('Azure, AWS, Google Cloud and private infrastructure deployment planning. This is a preview: no AI call, cloud resource or customer license is provisioned.'),
  const SizedBox(height:16),
  TextField(controller:app,maxLength:120,decoration:const InputDecoration(labelText:'Application name')),
  TextField(controller:repo,decoration:const InputDecoration(labelText:'GitHub repository HTTPS URL (optional)')),
  DropdownButtonFormField<String>(value:stack,decoration:const InputDecoration(labelText:'Application stack'),
   items:['Flutter web','React','Node.js','Python FastAPI','Docker container'].map((x)=>DropdownMenuItem(value:x,child:Text(x))).toList(),
   onChanged:(v)=>setState(()=>stack=v??stack)),
  DropdownButtonFormField<String>(value:provider,decoration:const InputDecoration(labelText:'Cloud provider'),
   items:['Azure','AWS','Google Cloud','Private infrastructure'].map((x)=>DropdownMenuItem(value:x,child:Text(x))).toList(),
   onChanged:(v)=>setState(()=>provider=v??provider)),
  TextField(controller:budget,keyboardType:TextInputType.number,decoration:const InputDecoration(labelText:'Maximum estimated monthly spend (USD)')),
  const SizedBox(height:12),
  Wrap(spacing:10,runSpacing:10,children:[
   FilledButton(onPressed:busy?null:()=>execute('previewCloudAutomationPlan'),child:const Text('Generate deployment checklist')),
   OutlinedButton(onPressed:busy?null:()=>execute('importCloudAutomationPlan'),child:const Text('Save plan in Workspace')),
  ]),
  if(error!=null)Text(error!,style:TextStyle(color:Theme.of(context).colorScheme.error)),
  if(preview!=null)Card(child:Padding(padding:const EdgeInsets.all(14),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
   Text(preview!['imported']==true?'Saved for review — no deployment':'Proposed checklist',style:Theme.of(context).textTheme.titleMedium),
   for(final item in (preview!['checklist'] as List? ?? []))Text('• $item'),
   const Text('Budget is a planning ceiling only; cloud cost limits are not enforced.'),
  ]))),
  const SizedBox(height:18),
  Text('Saved Workspace plans',style:Theme.of(context).textTheme.titleMedium),
  for(final row in saved.whereType<Map>())Card(child:ListTile(
   title:Text(row['appName']?.toString()??'Application'),
   subtitle:Text('${row['provider']} · ${row['stack']} · USD ${row['monthlyBudgetUsd']}/month (estimate)\nNot connected · not deployed'),
   isThreeLine:true)),
  const Divider(),
  OutlinedButton.icon(onPressed:()=>open(AutomationStudio(store:widget.store)),icon:const Icon(Icons.hub),label:const Text('Open existing Automation Studio / Dynamics 365')),
  OutlinedButton.icon(onPressed:()=>open(ResellerOnboardingDashboard(store:widget.store)),icon:const Icon(Icons.assignment),label:const Text('Open Microsoft reseller onboarding')),
 ]));
}
