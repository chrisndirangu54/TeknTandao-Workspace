import 'dart:convert';
import 'package:flutter/material.dart';
import '../suite.dart';

class ManagedCloudDeploymentScreen extends StatefulWidget {
  final SuiteStore store;
  const ManagedCloudDeploymentScreen({super.key, required this.store});
  @override
  State<ManagedCloudDeploymentScreen> createState() => _ManagedCloudDeploymentScreenState();
}

class _ManagedCloudDeploymentScreenState extends State<ManagedCloudDeploymentScreen> {
  final name=TextEditingController();
  final repository=TextEditingController();
  final branch=TextEditingController(text:'main');
  final budget=TextEditingController(text:'25');
  String region='europe-west1';
  bool autoDeploy=true, busy=false;
  String? error;
  List<Map<String,dynamic>> projects=[];
  @override
  void initState(){super.initState();refresh();}
  @override
  void dispose(){name.dispose();repository.dispose();branch.dispose();budget.dispose();super.dispose();}
  Future<void> refresh()async{
    if(widget.store.demo){setState(()=>error='Connect to a real Workspace before registering deployments.');return;}
    try{
      final r=await widget.store.call('cloudListGithubServices');
      if(mounted)setState(()=>projects=(r['projects'] as List? ?? [])
        .map((x)=>Map<String,dynamic>.from(x as Map)).toList());
    }catch(_){if(mounted)setState(()=>error='Could not load cloud deployments.');}
  }
  Future<void> register()async{
    if(busy)return;
    setState((){busy=true;error=null;});
    try{
      final slug=name.text.trim().toLowerCase().replaceAll(RegExp(r'[^a-z0-9-]'),'-')
        .replaceAll(RegExp(r'-+'),'-').replaceAll(RegExp(r'^-|-$'),'');
      final result=await widget.store.call('cloudRegisterGithubService',{'service':{
        'name':name.text.trim(),'repository':repository.text.trim(),'branch':branch.text.trim(),
        'cloudRegion':region,'serviceName':slug,
        'monthlyBudgetUsd':double.parse(budget.text.trim()),
        'autoDeploy':autoDeploy,'customerConsent':true}});
      if(!mounted)return;
      await showDialog<void>(context:context,builder:(context)=>AlertDialog(
        title:const Text('Save your one-time CI/CD token securely'),
        content:SizedBox(width:580,child:SingleChildScrollView(child:Column(
          crossAxisAlignment:CrossAxisAlignment.start,mainAxisSize:MainAxisSize.min,children:[
          const Text('Create GitHub Actions secret TEKNTANDAO_INGEST_TOKEN using this token. Do not commit it or share it publicly.'),
          const SizedBox(height:12),SelectableText(result['ingestionToken']?.toString()??''),
          const SizedBox(height:12),
          SelectableText('Project ID: '+(result['id']?.toString()??'')),
          SelectableText('Organisation ID: '+widget.store.orgId),
          const SizedBox(height:12),
          const Text('Install templates/cloud/tekntandao-cloud-run.yml in your GitHub repository. Configure GCP workload identity, deployment secrets and variables described in the guide. No deployment has occurred.')
          ]))),
        actions:[FilledButton(onPressed:()=>Navigator.pop(context),child:const Text('I saved the token'))]));
      await refresh();
    }catch(_){if(mounted)setState(()=>error='Invalid details or unavailable backend. Check the GitHub URL, budget, permission and deployed functions.');}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> inspect(String projectId)async{
    try{
      final info=await widget.store.call('cloudGetGithubServiceInsights',{'projectId':projectId});
      if(!mounted)return;
      await showDialog<void>(context:context,builder:(context)=>AlertDialog(
        title:const Text('Deployment and operational insights'),
        content:SizedBox(width:640,child:SingleChildScrollView(child:SelectableText(
          const JsonEncoder.withIndent('  ').convert(info)))),
        actions:[TextButton(onPressed:()=>Navigator.pop(context),child:const Text('Close'))]));
    }catch(_){if(mounted)setState(()=>error='Could not load deployment insights.');}
  }
  @override
  Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Managed Cloud Deployments'),actions:[
      IconButton(onPressed:refresh,icon:const Icon(Icons.refresh),tooltip:'Refresh')]),
    body:ListView(padding:const EdgeInsets.all(20),children:[
      Text('Connect a repository',style:Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height:8),
      const Text('Deploy code through customer-owned GitHub Actions and Google Cloud Run. Each cloud project requires verified workload identity permissions. Workspace does not execute uploaded source code, and CI outcomes are reported rather than independently verified.'),
      const SizedBox(height:20),
      Wrap(spacing:12,runSpacing:12,children:[
        SizedBox(width:220,child:TextField(controller:name,
          decoration:const InputDecoration(labelText:'Application name',border:OutlineInputBorder()))),
        SizedBox(width:340,child:TextField(controller:repository,
          decoration:const InputDecoration(labelText:'GitHub repository HTTPS URL',border:OutlineInputBorder()))),
        SizedBox(width:160,child:TextField(controller:branch,
          decoration:const InputDecoration(labelText:'Deploy branch',border:OutlineInputBorder()))),
        SizedBox(width:150,child:TextField(controller:budget,
          keyboardType:TextInputType.number,
          decoration:const InputDecoration(labelText:'Monthly budget (USD)',border:OutlineInputBorder()))),
        DropdownButton<String>(value:region,items:const [
          DropdownMenuItem(value:'europe-west1',child:Text('Belgium')),
          DropdownMenuItem(value:'europe-west4',child:Text('Netherlands')),
          DropdownMenuItem(value:'us-central1',child:Text('Iowa')),
          DropdownMenuItem(value:'asia-south1',child:Text('Mumbai')),
        ],onChanged:(v)=>setState(()=>region=v??region)),
      ]),
      SwitchListTile(title:const Text('Automatic GitHub push deployments'),
        subtitle:const Text('Effective once the approved workflow and cloud identity are configured.'),
        value:autoDeploy,onChanged:(v)=>setState(()=>autoDeploy=v)),
      Align(alignment:Alignment.centerLeft,child:FilledButton.icon(
        onPressed:busy?null:register,icon:const Icon(Icons.cloud_upload_outlined),
        label:const Text('Register cloud deployment'))),
      if(error!=null)Padding(padding:const EdgeInsets.all(12),child:Text(error!,
        style:const TextStyle(color:Colors.red))),
      const Divider(height:32),
      Text('Cloud services',style:Theme.of(context).textTheme.titleLarge),
      if(projects.isEmpty)const ListTile(title:Text('No GitHub deployments registered')),
      for(final project in projects)Card(child:ListTile(
        leading:const Icon(Icons.cloud_outlined),
        title:Text(project['name']?.toString()??'Service'),
        subtitle:Text((project['repository']?.toString()??'')+' · '+
          (project['status']?.toString()??'not configured')),
        trailing:TextButton(onPressed:()=>inspect(project['id'].toString()),
          child:const Text('Insights')))),
      const SizedBox(height:16),
      const Text('Production deployment must be authorised in the customer cloud account. Never paste cloud keys or service account credentials into Workspace. Configure per-repository workload identity federation, budget alerts and protected GitHub environments.'),
    ]));
}