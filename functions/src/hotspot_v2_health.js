// Tenant-scoped health report. Deliberately distinguishes recorded state from live telemetry.
import {getFirestore} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
const err=(code,message)=>{throw new HttpsError(code,message);};
export const hotspotV2Health=onCall({region:'europe-west1'},async req=>{
 const org=req.data?.orgId;
 if(!req.auth)err('unauthenticated','Sign in required');
 if(!req.data||Object.keys(req.data).some(k=>k!=='orgId')||
  typeof org!=='string'||!/^[A-Za-z0-9_-]{5,100}$/.test(org))
   err('invalid-argument','Invalid organization');
 const root=getFirestore().collection('organizations').doc(org);
 const member=await root.collection('members').doc(req.auth.uid).get();
 if(!member.exists||!['owner','admin','operator'].includes(member.data()?.role))
   err('permission-denied','Insufficient membership');
 const h=root.collection('hotspotV2').doc('control');
 const [sites,plans,vouchers,requests]=await Promise.all([
  h.collection('sites').limit(100).get(),h.collection('plans').limit(100).get(),
  h.collection('vouchers').limit(100).get(),h.collection('gatewayRequests').limit(100).get()]);
 const items=s=>s.docs.map(x=>x.data());
 const ss=items(sites),pp=items(plans),vv=items(vouchers),rr=items(requests);
 return {
  organizationId:org,source:'firestore_control_plane',liveNetworkTelemetry:false,
  verifiedGatewayCount:ss.filter(x=>x.gatewayVerified===true).length,
  recordedSites:ss.length,commissionedSites:ss.filter(x=>x.state==='commissioned').length,
  publishedPlans:pp.filter(x=>x.state==='published').length,
  voucherRecords:vv.length,revokedVouchers:vv.filter(x=>x.state==='revoked').length,
  awaitingPayment:vv.filter(x=>x.state==='pending_payment').length,
  disconnectRequests:rr.length,unexecutedDisconnectRequests:rr.filter(x=>x.executed!==true).length,
  sampleLimitPerCollection:100,truncated:[sites,plans,vouchers,requests].some(x=>x.size===100),
  paymentSettlementConnected:false,radiusGatewayConnected:false,
  health:'integration_unverified',
  note:'Counts reflect stored management records, not real connected clients, device health or collected revenue.'
 };
});
