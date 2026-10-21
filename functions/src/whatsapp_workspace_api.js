import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {validateWorkspaceSender,validateLead,makeClickToChat,outreachMessage} from './whatsapp_outreach.js';

const db=getFirestore();
const callable=handler=>onCall({region:'europe-west1',enforceAppCheck:true},handler);
async function context(request,ownerOnly=false) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated','Sign in required');
  const orgId=String(request.data?.orgId||'');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(orgId)) throw new HttpsError('invalid-argument','Invalid workspace');
  const org=db.doc('organizations/'+orgId);
  const member=(await org.collection('members').doc(request.auth.uid).get()).data();
  if (!member || (ownerOnly && !['owner','admin'].includes(member.role)))
    throw new HttpsError('permission-denied','Workspace administrator required');
  return {org,orgId,member,uid:request.auth.uid};
}
const publicSender=data=>data?{phone:data.phone,displayName:data.displayName,verificationStatus:data.verificationStatus,sendingEnabled:false}:null;
export const getWhatsAppWorkspaceSettings=callable(async request=>{
  const {org}=await context(request);
  const snapshot=await org.collection('integrations').doc('whatsapp').get();
  return {sender:publicSender(snapshot.data())};
});
export const configureWhatsAppWorkspace=callable(async request=>{
  const {org,orgId,uid}=await context(request,true);
  let data;try{data=validateWorkspaceSender({workspaceId:orgId,phone:request.data.phone,displayName:request.data.displayName});}
  catch(e){throw new HttpsError('invalid-argument',e.message)}
  await org.collection('integrations').doc('whatsapp').set({...data,updatedAt:FieldValue.serverTimestamp(),updatedBy:uid});
  await org.collection('whatsappAudit').add({action:'sender_configured',actor:uid,at:FieldValue.serverTimestamp()});
  return {sender:publicSender(data)};
});
export const disableWhatsAppWorkspace=callable(async request=>{
  const {org,uid}=await context(request,true);
  await org.collection('integrations').doc('whatsapp').delete();
  await org.collection('whatsappAudit').add({action:'sender_removed',actor:uid,at:FieldValue.serverTimestamp()});
  return {ok:true};
});
export const upsertWhatsAppLead=callable(async request=>{
  const {org,orgId,uid}=await context(request,true);
  let lead;try{lead=validateLead(request.data.lead);}
  catch(e){throw new HttpsError('invalid-argument',e.message)}
  const leadId=String(request.data.leadId||'');
  if(leadId && !/^[a-zA-Z0-9_-]{1,100}$/.test(leadId))throw new HttpsError('invalid-argument','Invalid lead ID');
  const ref=leadId?org.collection('whatsappLeads').doc(leadId):org.collection('whatsappLeads').doc();
  const existing=(await ref.get()).data();
  if(existing?.consentStatus==='opted_out' && lead.consentStatus!=='opted_out')
    throw new HttpsError('failed-precondition','Opt-out cannot be reset by lead import');
  await ref.set({...lead,workspaceId:orgId,suppressed:lead.consentStatus==='opted_out'||existing?.suppressed===true,
    updatedBy:uid,updatedAt:FieldValue.serverTimestamp()}, {merge:true});
  return {leadId:ref.id};
});
export const listWhatsAppLeads=callable(async request=>{
  const {org}=await context(request);
  const list=await org.collection('whatsappLeads').orderBy('updatedAt','desc').limit(100).get();
  return {leads:list.docs.map(d=>({id:d.id,...d.data(),updatedAt:null}))};
});
export const prepareWhatsAppChat=callable(async request=>{
  const {org}=await context(request);
  const leadId=String(request.data.leadId||'');
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(leadId))throw new HttpsError('invalid-argument','Invalid lead ID');
  const lead=(await org.collection('whatsappLeads').doc(leadId).get()).data();
  if(!lead||lead.suppressed||lead.consentStatus==='opted_out')throw new HttpsError('failed-precondition','Contact unavailable or opted out');
  const sender=(await org.collection('integrations').doc('whatsapp').get()).data();
  if(!sender)throw new HttpsError('failed-precondition','Configure your workspace business identity first');
  const message=outreachMessage({organization:lead.organization,category:String(request.data.category||'business').slice(0,80),
    locale:['en','sw','fr'].includes(request.data.locale)?request.data.locale:'en',senderName:sender.displayName});
  return {url:makeClickToChat(lead.phone,message),manualSendOnly:true};
});
