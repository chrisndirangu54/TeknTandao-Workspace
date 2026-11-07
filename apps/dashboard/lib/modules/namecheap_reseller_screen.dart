import 'package:flutter/material.dart';
import '../suite.dart';

class NamecheapResellerScreen extends StatefulWidget {
  final SuiteStore store;
  const NamecheapResellerScreen({super.key, required this.store});
  @override
  State<NamecheapResellerScreen> createState()=>_NamecheapResellerScreenState();
}
class _NamecheapResellerScreenState extends State<NamecheapResellerScreen> {
  final domain=TextEditingController();
  String kind='domain',package='starter',message='';
  bool busy=false;
  Map<String,dynamic> availability={};
  List<Map<String,dynamic>> orders=[];
  @override
  void initState(){super.initState();refresh();}
  @override
  void dispose(){domain.dispose();super.dispose();}
  Future<void> refresh()async{
    if(widget.store.demo)return;
    try{
      final data=await widget.store.call('namecheapListResellerRequests');
      if(mounted)setState(()=>orders=(data['requests'] as List? ?? [])
        .map((e)=>Map<String,dynamic>.from(e as Map)).toList());
    }catch(_){if(mounted)setState(()=>message='Unable to fetch reseller requests.');}
  }
  Future<void> check()async{
    if(busy||widget.store.demo)return;
    setState((){busy=true;message='';});
    try{
      final result=await widget.store.call('namecheapCheckDomain',
        {'domain':domain.text.trim().toLowerCase()});
      if(mounted)setState((){
        availability=result;message=result['available']==true?
          'Available in sandbox. Live availability, price and permission must be confirmed before purchase.':
          'Domain unavailable in sandbox. Live availability may differ.';
      });
    }catch(_){if(mounted)setState(()=>message='Namecheap sandbox not connected. Configure sandbox API credentials and fixed outbound IP.');}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> submit()async{
    if(busy||widget.store.demo)return;
    setState(()=>busy=true);
    try{
      final details=<String,dynamic>{
        'domain':domain.text.trim().toLowerCase(),'customerApproved':true
      };
      if(kind=='domain'){
        details['years']=1;details['purpose']='register';
      }else{
        details['packageCode']=package;
      }
      final result=await widget.store.call('namecheapSubmitResellerRequest',{
        'kind':kind,'details':details
      });
      if(mounted)setState(()=>message='Request '+result['id'].toString()+
        ' submitted for a quote. No payment or provisioning has occurred.');
      await refresh();
    }catch(_){if(mounted)setState(()=>message='Unable to create request. Verify the domain and account permissions.');}
    finally{if(mounted)setState(()=>busy=false);}
  }
  @override
  Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Namecheap Domain & Hosting Reseller'),
      actions:[IconButton(icon:const Icon(Icons.refresh),onPressed:refresh)]),
    body:ListView(padding:const EdgeInsets.all(20),children:[
      Text('Domains and hosting',style:Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height:8),
      const Text('Namecheap domain lookups and quote requests are integrated. Live registration and WHM/cPanel provisioning require authorised provider credentials and paid customer orders.'),
      const SizedBox(height:18),
      SegmentedButton<String>(segments:const [
        ButtonSegment(value:'domain',label:Text('Domain'),icon:Icon(Icons.language)),
        ButtonSegment(value:'hosting',label:Text('Hosting'),icon:Icon(Icons.dns))
      ],selected:{kind},onSelectionChanged:(v)=>setState(()=>kind=v.first)),
      const SizedBox(height:12),
      TextField(controller:domain,decoration:const InputDecoration(
        labelText:'Customer domain (example.com)',border:OutlineInputBorder())),
      const SizedBox(height:12),
      if(kind=='domain')OutlinedButton.icon(
        onPressed:busy?null:check,icon:const Icon(Icons.search),label:const Text('Check sandbox availability')),
      if(kind=='domain'&&availability.isNotEmpty)
        Card(child:ListTile(
          title:Text(availability['domain']?.toString()??'Domain'),
          subtitle:const Text('Sandbox result only — not a payable quote'),
          trailing:Text(availability['available']==true?'Sandbox available':'Sandbox unavailable'))),
      if(kind=='hosting')Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        const Text('Hosting packages must be mapped to approved WHM account packages before activation.'),
        DropdownButton<String>(value:package,items:const [
          DropdownMenuItem(value:'starter',child:Text('Starter')),
          DropdownMenuItem(value:'business',child:Text('Business')),
          DropdownMenuItem(value:'pro',child:Text('Professional'))
        ],onChanged:(v)=>setState(()=>package=v??package))
      ]),
      const SizedBox(height:10),
      Align(alignment:Alignment.centerLeft,child:FilledButton.icon(
        onPressed:busy?null:submit,icon:const Icon(Icons.request_quote_outlined),
        label:Text(kind=='domain'?'Request domain quote':'Request hosting quote'))),
      if(message.isNotEmpty)Padding(padding:const EdgeInsets.symmetric(vertical:12),child:Text(message)),
      const Divider(height:32),
      Text('Reseller requests',style:Theme.of(context).textTheme.titleLarge),
      if(orders.isEmpty)const Text('No orders submitted yet.'),
      for(final item in orders)Card(child:ListTile(
        leading:Icon(item['kind']=='domain'?Icons.language:Icons.dns),
        title:Text(item['domain']?.toString()??'Domain'),
        subtitle:Text((item['kind']?.toString()??'')+' · '+(item['state']?.toString()??'')),
        trailing:const Icon(Icons.pending_actions_outlined))),
      const Divider(height:32),
      const Text('Before live sales: Namecheap API activation, whitelisted fixed IPv4, actual pricing, consented registration contacts, paid checkout reconciliation and approved WHM API credentials are required.')
    ]));
}