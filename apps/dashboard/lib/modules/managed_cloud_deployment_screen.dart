import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:http/http.dart' as http;
import '../suite.dart';
import 'managed_cloud_billing_screen.dart';

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
  String cloudProvider='gcp_cloud_run';
  bool autoDeploy=true, busy=false;
  String? error;
  List<Map<String,dynamic>> projects=[];
  List<Map<String,dynamic>> archives=[];
  @override
  void initState(){super.initState();refresh();}
  @override
  void dispose(){name.dispose();repository.dispose();branch.dispose();budget.dispose();super.dispose();}
  Future<void> refresh()async{
    if(widget.store.demo){setState(()=>error='Connect to a real Workspace before registering deployments.');return;}
    try{
      final r=await widget.store.call('cloudListGithubServices');
      final a=await widget.store.call('cloudListArchiveSubmissions');
      if(mounted)setState((){
        projects=(r['projects'] as List? ?? []).map((x)=>Map<String,dynamic>.from(x as Map)).toList();
        archives=(a['submissions'] as List? ?? []).map((x)=>Map<String,dynamic>.from(x as Map)).toList();
      });
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
        'cloudProvider':cloudProvider,'cloudRegion':region,'serviceName':slug,
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
          const Text('Install templates/cloud/tekntandao-multicloud.yml in your GitHub repository. Configure the provider, GitHub actions secrets and paid deployment preflight. No deployment has occurred.')
          ]))),
        actions:[FilledButton(onPressed:()=>Navigator.pop(context),child:const Text('I saved the token'))]));
      await refresh();
    }catch(_){if(mounted)setState(()=>error='Invalid details or unavailable backend. Check the GitHub URL, budget, permission and deployed functions.');}
    finally{if(mounted)setState(()=>busy=false);}
  }

  Future<void> uploadArchive() async {
    if (busy) return;
    setState(() {busy=true;error=null;});
    try {
      if (widget.store.demo) throw StateError('Sign in to a real workspace');
      final selected=await FilePicker.platform.pickFiles(
        type:FileType.custom,allowedExtensions:['zip'],withData:true);
      if (selected==null || selected.files.isEmpty) return;
      final file=selected.files.single;
      if (file.bytes==null || file.size<1 || file.size>10*1024*1024)
        throw StateError('Select a ZIP under 10 MB');
      final project=file.name.length>4 ? file.name.substring(0,file.name.length-4) : file.name;
      final created=await widget.store.call('cloudCreateArchiveSubmission',{'archive':{
        'projectName':project,'filename':file.name,
        'expectedBytes':file.size,'customerConsent':true}});
      final response=await http.put(Uri.parse(created['uploadUrl'].toString()),
        headers:{'Content-Type':'application/zip'},body:file.bytes);
      if (response.statusCode!=200 && response.statusCode!=201)
        throw StateError('Upload failed');
      await widget.store.call('cloudFinalizeArchiveSubmission',{'submissionId':created['id']});
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content:Text('Archive quarantined; deployment requires security review.')));
      await refresh();
    } catch (_) {
      if(mounted)setState(()=>error='ZIP upload unsuccessful. Check your storage CORS and permissions.');
    } finally {if(mounted)setState(()=>busy=false);}
  }
  Future<void> inspect(String projectId) async {
    try {
      final info=await widget.store.call('cloudGetGithubServiceInsights',{'projectId':projectId});
      if(!mounted)return;
      await showDialog<void>(context:context,builder:(context)=>AlertDialog(
        title:const Text('Deployment insights'),
        content:SizedBox(width:640,child:SingleChildScrollView(child:SelectableText(
          const JsonEncoder.withIndent('  ').convert(info)))),
        actions:[
          TextButton.icon(onPressed:()async{
            Navigator.pop(context);
            await showAiInsights(projectId);
          },icon:const Icon(Icons.auto_awesome_outlined),label:const Text('AI analysis')),
          TextButton(onPressed:()=>Navigator.pop(context),child:const Text('Close'))
        ]));
    } catch (_) {if(mounted)setState(()=>error='Unable to load deployment insights.');}
  }
  Future<void> showAiInsights(String projectId) async {
    try {
      final r=await widget.store.call('cloudExplainDeploymentInsights',{'projectId':projectId});
      if(!mounted)return;
      await showDialog<void>(context:context,builder:(context)=>AlertDialog(
        title:const Text('AI-assisted analysis'),
        content:SizedBox(width:640,child:SingleChildScrollView(child:SelectableText(
          const JsonEncoder.withIndent('  ').convert(r)))),
        actions:[TextButton(onPressed:()=>Navigator.pop(context),child:const Text('Close'))]));
    } catch (_) {if(mounted)setState(()=>error='AI analysis unavailable.');}
  }
  @override
  Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Managed Cloud Deployments'),actions:[
      IconButton(onPressed:refresh,icon:const Icon(Icons.refresh),tooltip:'Refresh')]),
    body:ListView(padding:const EdgeInsets.all(20),children:[
      Text('Connect a repository',style:Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height:8),
      const Text('Deploy code through customer-owned GitHub Actions and your selected cloud provider. Each cloud project requires verified workload identity permissions. Workspace does not execute uploaded source code, and CI outcomes are reported rather than independently verified.'),
      const SizedBox(height:20),
      Wrap(spacing:12,runSpacing:12,children:[
        DropdownButton<String>(value:cloudProvider,items:const [
          DropdownMenuItem(value:'gcp_cloud_run',child:Text('Google Cloud Run')),
          DropdownMenuItem(value:'aws_apprunner',child:Text('AWS App Runner')),
          DropdownMenuItem(value:'azure_container_apps',child:Text('Azure Container Apps')),
          DropdownMenuItem(value:'digitalocean_app_platform',child:Text('DigitalOcean')),
          DropdownMenuItem(value:'cloudflare_pages',child:Text('Cloudflare Pages')),
          DropdownMenuItem(value:'railway',child:Text('Railway')),
          DropdownMenuItem(value:'render',child:Text('Render')),
        ],onChanged:(v)=>setState(()=>cloudProvider=v??cloudProvider)),
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
      Text('Submit source code as ZIP',style:Theme.of(context).textTheme.titleLarge),
      const Text('Upload up to 10 MB. Archives are quarantined and cannot run until a separate secure builder, malware scanner and approval workflow are configured.'),
      Align(alignment:Alignment.centerLeft,child:OutlinedButton.icon(
        onPressed:busy?null:uploadArchive,icon:const Icon(Icons.folder_zip_outlined),
        label:const Text('Select and upload ZIP archive'))),
      for(final archive in archives)ListTile(
        leading:const Icon(Icons.inventory_2_outlined),
        title:Text(archive['filename']?.toString()??'Archive'),
        subtitle:Text(archive['status']?.toString()??'Pending')),
      const Divider(height:32),
      Text('Cloud services',style:Theme.of(context).textTheme.titleLarge),
      if(projects.isEmpty)const ListTile(title:Text('No GitHub deployments registered')),
      for(final project in projects)Card(child:ListTile(
        leading:const Icon(Icons.cloud_outlined),
        title:Text(project['name']?.toString()??'Service'),
        subtitle:Text((project['repository']?.toString()??'')+' · '+
          (project['status']?.toString()??'not configured')),
        trailing:Wrap(spacing:6,children:[
          TextButton(onPressed:()=>Navigator.of(context).push(MaterialPageRoute<void>(
            builder:(_)=>ManagedCloudBillingScreen(store:widget.store,
              projectId:project['id'].toString()))),child:const Text('Pay / Renew')),
          TextButton(onPressed:()=>inspect(project['id'].toString()),
            child:const Text('Insights'))]))),
      const SizedBox(height:16),
      const Text('Production deployment must be authorised in the customer cloud account. Never paste cloud keys or service account credentials into Workspace. Configure per-repository workload identity federation, budget alerts and protected GitHub environments.'),
    ]));
}
