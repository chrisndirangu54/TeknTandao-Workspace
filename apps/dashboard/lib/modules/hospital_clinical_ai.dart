import 'package:flutter/material.dart';
import '../suite.dart';

class HospitalClinicalAiScreen extends StatefulWidget {
  final SuiteStore store;
  const HospitalClinicalAiScreen({super.key,required this.store});
  @override
  State<HospitalClinicalAiScreen> createState()=>_HospitalClinicalAiScreenState();
}
class _HospitalClinicalAiScreenState extends State<HospitalClinicalAiScreen> {
  final patient=TextEditingController();
  final evidenceTitle=TextEditingController();
  final evidenceUrl=TextEditingController();
  final evaluationDataset=TextEditingController();
  String task='questions_to_check',model='medgemma-1.5-4b';
  String message='Clinician-supervised decision support; no autonomous diagnosis.';
  bool busy=false;
  List<Map<String,dynamic>> references=[];
  final Set<String> chosen={};
  @override void dispose(){
    patient.dispose();evidenceTitle.dispose();evidenceUrl.dispose();
    evaluationDataset.dispose();super.dispose();
  }
  Future<void> load() async {
    setState(()=>busy=true);
    try {
      final r=await widget.store.call('hospitalClinicalAiListEvidence');
      if(!mounted)return;
      setState(()=>references=((r['references'] as List?)??[])
        .map((x)=>Map<String,dynamic>.from(x as Map)).toList());
    } catch(e){if(mounted)setState(()=>message='Evidence unavailable: $e');}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> submit() async {
    if(patient.text.trim().isEmpty)return;
    setState(()=>busy=true);
    try {
      final r=await widget.store.call('hospitalClinicalAiSubmitReview',{
        'patientId':patient.text.trim(),'task':task,'modelId':model,
        'evidenceIds':chosen.toList()});
      if(!mounted)return;
      setState(()=>message=r['message']?.toString()??'Review submitted');
    } catch(e){if(mounted)setState(()=>message='Request not accepted: $e');}
    finally{if(mounted)setState(()=>busy=false);}
  }
  @override Widget build(BuildContext context)=>ListView(
    padding:const EdgeInsets.all(20),children:[
      Text('Hospital Clinical AI',style:Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height:8),
      const Text('Verified clinical staff only. Patient consent is checked by the server. '
        'Research models are not accredited diagnostic systems.'),
      const SizedBox(height:12),
      TextField(controller:patient,decoration:const InputDecoration(labelText:'Authorized patient ID')),
      DropdownButtonFormField<String>(initialValue:model,
        decoration:const InputDecoration(labelText:'Research model'),
        items:const [
          DropdownMenuItem(value:'medgemma-1.5-4b',child:Text('Google MedGemma 1.5 4B')),
          DropdownMenuItem(value:'medgemma-27b',child:Text('Google MedGemma 27B')),
        ],onChanged:(v)=>setState(()=>model=v??model)),
      DropdownButtonFormField<String>(initialValue:task,
        decoration:const InputDecoration(labelText:'Clinician workflow'),
        items:const [
          DropdownMenuItem(value:'questions_to_check',child:Text('Questions to check')),
          DropdownMenuItem(value:'clinical_summary',child:Text('Clinical summary review')),
          DropdownMenuItem(value:'diagnostic_considerations',child:Text('Diagnostic considerations')),
          DropdownMenuItem(value:'lab_review',child:Text('Lab review')),
          DropdownMenuItem(value:'evidence_review',child:Text('Evidence review')),
        ],onChanged:(v)=>setState(()=>task=v??task)),
      OutlinedButton.icon(onPressed:busy?null:load,
        icon:const Icon(Icons.menu_book),label:const Text('Load approved references')),
      for(final r in references)CheckboxListTile(
        value:chosen.contains(r['id']),
        onChanged:(v)=>setState(() {
          final id=r['id']?.toString()??'';
          if(v==true&&chosen.length<8)chosen.add(id);
          if(v==false)chosen.remove(id);
        }),
        title:Text(r['title']?.toString()??'Reviewed source'),
        subtitle:Text(r['publisher']?.toString()??''),
      ),
      FilledButton.icon(onPressed:busy?null:submit,
        icon:const Icon(Icons.fact_check_outlined),
        label:const Text('Request clinician evidence review')),
      const SizedBox(height:12),
      if(busy)const LinearProgressIndicator(),
      SelectableText(message),
      const SizedBox(height:8),
      const Text('Automated microbiology, imaging and clinical reasoning remain disabled '
        'until validated datasets, model deployment, hospital authorization and clinical review are established.'),
    ]);
}
