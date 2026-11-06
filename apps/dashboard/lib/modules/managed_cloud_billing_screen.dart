import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../suite.dart';

class ManagedCloudBillingScreen extends StatefulWidget {
  final SuiteStore store;
  final String projectId;
  const ManagedCloudBillingScreen({super.key,required this.store,required this.projectId});
  @override
  State<ManagedCloudBillingScreen> createState()=>_ManagedCloudBillingScreenState();
}
class _ManagedCloudBillingScreenState extends State<ManagedCloudBillingScreen> {
  final email=TextEditingController();
  final phone=TextEditingController(text:'+254');
  String method='mpesa',plan='starter',reference='',message='';
  Map<String,dynamic> status={};
  bool busy=false;
  @override
  void initState(){super.initState();refresh();}
  @override
  void dispose(){email.dispose();phone.dispose();super.dispose();}
  Future<void> refresh()async {
    try {
      final result=await widget.store.call('cloudGetSubscriptionStatus',
        {'projectId':widget.projectId});
      if(mounted)setState(()=>status=result);
    }catch(_) {if(mounted)setState(()=>message='Subscription status unavailable.');}
  }
  Future<void> start()async{
    if(busy)return;
    setState((){busy=true;message='';});
    try {
      final data=<String,dynamic>{
        'projectId':widget.projectId,'plan':plan,'method':method,
        'email':email.text.trim(),'customerConfirmed':true
      };
      if(method=='mpesa')data['phone']=phone.text.trim();
      final result=await widget.store.call('cloudStartSubscriptionCheckout',
        {'checkout':data});
      reference=result['reference']?.toString()??'';
      final url=result['authorizationUrl']?.toString();
      if(url!=null){
        final parsed=Uri.parse(url);
        if(parsed.scheme!='https')throw StateError('Invalid payment redirect');
        if(!await launchUrl(parsed,webOnlyWindowName:'_blank')) {
          throw StateError('Unable to open Paystack checkout');
        }
      }
      if(mounted)setState(()=>message=result['instruction']?.toString()??
        'Complete the Paystack checkout, then select Verify payment.');
    }catch(_) {if(mounted)setState(()=>message=
      'Unable to initiate checkout. Check your payment details or merchant configuration.');}
    finally {if(mounted)setState(()=>busy=false);}
  }
  Future<void> verify()async{
    if(reference.isEmpty)return;
    setState(()=>busy=true);
    try{
      final result=await widget.store.call('cloudVerifySubscriptionCheckout',
        {'reference':reference});
      if(mounted)setState(()=>message=result['verified']==true?
        'Payment verified. Managed deployment service is active.':
        'Payment is not yet confirmed. Complete authorisation and retry.');
      await refresh();
    }catch(_){if(mounted)setState(()=>message='Verification unavailable. No deployment unlocked.');}
    finally{if(mounted)setState(()=>busy=false);}
  }
  @override
  Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Managed cloud payments')),
    body:ListView(padding:const EdgeInsets.all(20),children:[
      Text('Prepaid deployment subscription',style:Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height:8),
      Text('Status: '+(status['status']?.toString()??'unpaid')),
      if(status['paidUntilMs'] is int)
        Text('Paid until: '+DateTime.fromMillisecondsSinceEpoch(status['paidUntilMs'] as int).toLocal().toString()),
      const Text('Service charges below are provisional and exclude cloud provider consumption. M-Pesa renewals require a new payment.'),
      DropdownButton<String>(value:plan,items:const [
        DropdownMenuItem(value:'starter',child:Text('Starter · KES 1,500 / 30 days')),
        DropdownMenuItem(value:'growth',child:Text('Growth · KES 5,000 / 30 days')),
        DropdownMenuItem(value:'business',child:Text('Business · KES 15,000 / 30 days'))
      ],onChanged:busy?null:(v)=>setState(()=>plan=v??plan)),
      DropdownButton<String>(value:method,items:const [
        DropdownMenuItem(value:'mpesa',child:Text('M-Pesa STK push via Paystack')),
        DropdownMenuItem(value:'paystack',child:Text('Paystack checkout'))
      ],onChanged:busy?null:(v)=>setState(()=>method=v??method)),
      TextField(controller:email,decoration:const InputDecoration(labelText:'Billing email')),
      if(method=='mpesa')TextField(controller:phone,
        decoration:const InputDecoration(labelText:'Kenyan M-Pesa number (+254...)')),
      const SizedBox(height:12),
      Wrap(spacing:10,children:[
        FilledButton(onPressed:busy?null:start,child:const Text('Start payment')),
        OutlinedButton(onPressed:busy||reference.isEmpty?null:verify,
          child:const Text('Verify payment'))
      ]),
      if(reference.isNotEmpty)SelectableText('Payment reference: '+reference),
      if(message.isNotEmpty)Padding(padding:const EdgeInsets.all(12),child:Text(message)),
      const SizedBox(height:24),
      const Text('Cloud resources remain private and provider charges are separate. An independently verified payment must be active for GitHub CI/CD to pass the deployment gate.')
    ]));
}