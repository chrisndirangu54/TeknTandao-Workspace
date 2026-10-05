import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

class CrmModuleScreen extends StatefulWidget {
  final SuiteStore store;
  const CrmModuleScreen({super.key, required this.store});
  @override State<CrmModuleScreen> createState()=>_CrmModuleScreenState();
}

class _CrmModuleScreenState extends State<CrmModuleScreen>{
  String query='';
  bool saving=false;

  Future<void> addContact() async{
    final details=await recordForm(context,'Add CRM Customer',['Company / Person Name','Email','Phone Number','Location']);
    if(details==null||details.isEmpty||details[0].trim().isEmpty)return;
    setState(()=>saving=true);
    try{
      await widget.store.call('saveRecord',{'appId':'crm','record':{
        'name':details[0].trim(),'email':details.length>1?details[1].trim():'',
        'phone':details.length>2?details[2].trim():'','location':details.length>3?details[3].trim():'',
        'type':'Lead','balanceKes':0,
      }});
    }catch(e){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('Could not save contact: $e'),backgroundColor:Colors.red.shade700));
    }finally{if(mounted)setState(()=>saving=false);}
  }

  @override Widget build(BuildContext context)=>Scaffold(
    backgroundColor:const Color(0xFFF5F7FB),
    appBar:AppBar(title:const Row(children:[Icon(Icons.people_alt_rounded,color:Color(0xFF2563EB)),SizedBox(width:10),Text('Sales & CRM')])),
    floatingActionButton:FloatingActionButton.extended(onPressed:saving?null:addContact,icon:const Icon(Icons.person_add_alt_1_rounded),label:Text(saving?'Saving…':'Add customer')),
    body:StreamBuilder<List<Map<String,dynamic>>>(
      stream:widget.store.watch('contacts'),
      builder:(context,snapshot){
        if(snapshot.connectionState==ConnectionState.waiting&&!snapshot.hasData)return const Center(child:CircularProgressIndicator());
        if(snapshot.hasError)return _StateCard(icon:Icons.cloud_off_rounded,title:'CRM data unavailable',message:snapshot.error.toString());
        final contacts=snapshot.data??const [];
        final normalized=query.trim().toLowerCase();
        final visible=normalized.isEmpty?contacts:contacts.where((c)=>c.values.any((v)=>v.toString().toLowerCase().contains(normalized))).toList();
        final leads=contacts.where((c)=>(c['type']??'Lead').toString().toLowerCase()=='lead').length;
        final customers=contacts.length-leads;
        return ListView(
          padding:const EdgeInsets.fromLTRB(24,24,24,100),
          children:[
            Container(
              padding:const EdgeInsets.all(24),
              decoration:BoxDecoration(
                gradient:const LinearGradient(colors:[Color(0xFF0F172A),Color(0xFF1D4ED8)]),
                borderRadius:BorderRadius.circular(24),
                boxShadow:const [BoxShadow(color:Color(0x220F172A),blurRadius:30,offset:Offset(0,12))],
              ),
              child:Wrap(spacing:28,runSpacing:18,crossAxisAlignment:WrapCrossAlignment.center,children:[
                const SizedBox(width:260,child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                  Text('Customer intelligence at a glance',style:TextStyle(color:Colors.white,fontSize:22,fontWeight:FontWeight.w800)),
                  SizedBox(height:6),
                  Text('Shared customer records, leads and follow-up context across the workspace.',style:TextStyle(color:Color(0xFFBFDBFE),height:1.4)),
                ])),
                _Metric(label:'Total contacts',value:contacts.length.toString(),icon:Icons.groups_rounded),
                _Metric(label:'Leads',value:leads.toString(),icon:Icons.track_changes_rounded),
                _Metric(label:'Customers',value:customers.toString(),icon:Icons.handshake_rounded),
              ]),
            ),
            const SizedBox(height:20),
            TextField(
              decoration:const InputDecoration(prefixIcon:Icon(Icons.search_rounded),hintText:'Search name, email, phone or location'),
              onChanged:(v)=>setState(()=>query=v),
            ),
            const SizedBox(height:16),
            if(contacts.isEmpty)
              const _StateCard(icon:Icons.people_outline_rounded,title:'No contacts yet',message:'Add your first lead or customer to start building the shared CRM.')
            else if(visible.isEmpty)
              const _StateCard(icon:Icons.search_off_rounded,title:'No matching contacts',message:'Try a broader search term.')
            else
              LayoutBuilder(builder:(context,constraints){
                final wide=constraints.maxWidth>900;
                if(!wide)return Column(children:[for(final c in visible)...[_ContactCard(contact:c),const SizedBox(height:10)]]);
                return Wrap(spacing:12,runSpacing:12,children:[for(final c in visible)SizedBox(width:(constraints.maxWidth-12)/2,child:_ContactCard(contact:c))]);
              }),
          ],
        );
      },
    ),
  );
}

class _Metric extends StatelessWidget{
  final String label,value;final IconData icon;
  const _Metric({required this.label,required this.value,required this.icon});
  @override Widget build(BuildContext context)=>Container(
    padding:const EdgeInsets.symmetric(horizontal:16,vertical:14),
    decoration:BoxDecoration(color:Colors.white.withValues(alpha:.09),borderRadius:BorderRadius.circular(16),border:Border.all(color:Colors.white.withValues(alpha:.12))),
    child:Row(mainAxisSize:MainAxisSize.min,children:[Icon(icon,color:Colors.white),const SizedBox(width:10),Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(value,style:const TextStyle(color:Colors.white,fontWeight:FontWeight.w800,fontSize:20)),Text(label,style:const TextStyle(color:Color(0xFFDBEAFE),fontSize:12))])]),
  );
}

class _ContactCard extends StatelessWidget{
  final Map<String,dynamic> contact;
  const _ContactCard({required this.contact});
  @override Widget build(BuildContext context){
    final name=(contact['name']??'Unnamed contact').toString().trim();
    final safeName=name.isEmpty?'Unnamed contact':name;
    final email=(contact['email']??'').toString().trim();
    final phone=(contact['phone']??'').toString().trim();
    final location=(contact['location']??'').toString().trim();
    final type=(contact['type']??'Lead').toString();
    return Container(
      padding:const EdgeInsets.all(18),
      decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(18),border:Border.all(color:const Color(0xFFE5E7EB)),boxShadow:const [BoxShadow(color:Color(0x0D0F172A),blurRadius:18,offset:Offset(0,6))]),
      child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
        CircleAvatar(backgroundColor:const Color(0xFFDBEAFE),child:Text(safeName[0].toUpperCase(),style:const TextStyle(color:Color(0xFF1D4ED8),fontWeight:FontWeight.w800))),
        const SizedBox(width:14),
        Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Row(children:[Expanded(child:Text(safeName,style:const TextStyle(fontWeight:FontWeight.w800,fontSize:16))),Chip(label:Text(type))]),
          if(email.isNotEmpty)Text(email,overflow:TextOverflow.ellipsis),
          const SizedBox(height:4),
          Wrap(spacing:12,runSpacing:4,children:[
            if(phone.isNotEmpty)Text(phone,style:const TextStyle(color:Color(0xFF64748B))),
            if(location.isNotEmpty)Text(location,style:const TextStyle(color:Color(0xFF64748B))),
          ]),
        ])),
      ]),
    );
  }
}

class _StateCard extends StatelessWidget{
  final IconData icon;final String title,message;
  const _StateCard({required this.icon,required this.title,required this.message});
  @override Widget build(BuildContext context)=>Center(child:Container(
    constraints:const BoxConstraints(maxWidth:560),padding:const EdgeInsets.all(28),
    decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(20),border:Border.all(color:const Color(0xFFE5E7EB))),
    child:Column(mainAxisSize:MainAxisSize.min,children:[Icon(icon,size:44,color:const Color(0xFF64748B)),const SizedBox(height:12),Text(title,style:const TextStyle(fontWeight:FontWeight.w800,fontSize:18)),const SizedBox(height:6),Text(message,textAlign:TextAlign.center,style:const TextStyle(color:Color(0xFF64748B)))]),
  ));
}
