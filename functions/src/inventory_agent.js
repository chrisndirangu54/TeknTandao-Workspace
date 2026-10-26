import './index.js';
import {randomUUID} from 'node:crypto';
import {getFirestore,FieldValue,FieldPath} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {identifier,canAccess} from './domain.js';
import {recommendInventoryPurchases} from './inventory_agent_domain.js';
const db=getFirestore(),stamp=()=>FieldValue.serverTimestamp();
const callable=handler=>onCall({region:'europe-west1'},async req=>{
 try{return await handler(req);}catch(error){
  if(error instanceof HttpsError)throw error;
  throw new HttpsError('failed-precondition',error.message||'Inventory agent unavailable');
 }
});
async function access(req,ownerOnly=false){
 if(!req.auth)throw new HttpsError('unauthenticated','Sign in first');
 const org=db.collection('organizations').doc(identifier(req.data?.orgId));
 const [member,inventory,procurement]=await Promise.all([
  org.collection('members').doc(req.auth.uid).get(),
  org.collection('apps').doc('inventory').get(),
  org.collection('apps').doc('procurement').get()]);
 if(!canAccess(member.data(),'inventory',inventory.data()))
  throw new HttpsError('permission-denied','Inventory access required');
 if(ownerOnly&&(member.data()?.role!=='owner'||!canAccess(member.data(),'procurement',procurement.data())))
  throw new HttpsError('permission-denied','Finance/procurement owner required');
 return {org,uid:req.auth.uid};
}
export const saveInventoryAgentReorderPolicy=callable(async req=>{
 const {org,uid}=await access(req,true);
 const sku=identifier(req.data?.sku),warehouseId=identifier(req.data?.warehouseId);
 const fields=['dailyDemand','leadDays','safetyStock','reserved','onOrder','unitCostMinor'];
 const policy={sku,warehouseId};
 for(const field of fields){
  const value=req.data?.[field]??(field==='safetyStock'||field==='reserved'||field==='onOrder'?0:null);
  if(value===null&&field==='unitCostMinor')continue;
  if(!Number.isSafeInteger(value)||value<0||value>1000000000)
   throw new Error('Invalid reorder policy: '+field);
  policy[field]=value;
 }
 if(req.data?.supplierId)policy.supplierId=identifier(req.data.supplierId);
 const stock=await org.collection('warehouseStock').doc(warehouseId+'__'+sku).get();
 if(!stock.exists||stock.data().sku!==sku||stock.data().warehouseId!==warehouseId)
  throw new HttpsError('not-found','Managed warehouse stock record required');
 await org.collection('inventoryAgentPolicies').doc(warehouseId+'__'+sku).set({
  ...policy,updatedBy:uid,updatedAt:stamp()},{merge:true});
 return {sku,warehouseId,status:'configured'};
});
export const getInventoryAgentRecommendations=callable(async req=>{
 const {org,uid}=await access(req);
 const pageSize=req.data?.pageSize??50;
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw new Error('Invalid page size');
 let query=org.collection('warehouseStock').orderBy(FieldPath.documentId()).limit(pageSize+1);
 if(req.data?.afterId){
  const cursor=await org.collection('warehouseStock').doc(identifier(req.data.afterId)).get();
  if(!cursor.exists)throw new Error('Invalid stock cursor');
  query=query.startAfter(cursor);
 }
 const page=await query.get(),docs=page.docs.slice(0,pageSize);
 const stock=docs.map(d=>({id:d.id,...d.data()}));
 const keys=stock.map(x=>x.warehouseId+'__'+x.sku);
 const [policies,products]=await Promise.all([
  Promise.all(keys.map(id=>org.collection('inventoryAgentPolicies').doc(id).get())),
  Promise.all([...new Set(stock.map(x=>x.sku))].map(id=>org.collection('products').doc(identifier(id)).get()))
 ]);
 const report=recommendInventoryPurchases(
  products.filter(d=>d.exists).map(d=>({id:d.id,...d.data()})),
  stock,policies.filter(d=>d.exists).map(d=>({id:d.id,...d.data()})),pageSize);
 const nextCursor=page.size>pageSize?docs[docs.length-1].id:null;
 const runId=randomUUID();
 await org.collection('inventoryAgentRuns').doc(runId).create({
  requestedBy:uid,mode:'read_only',createdAt:stamp(),analyzedStockRecords:report.analyzedStockRecords,
  recommended:report.totalRecommended,nextCursor,policyWarnings:report.warnings.length});
 return {...report,runId,nextCursor,hasMore:nextCursor!==null,
  scope:'One warehouse-stock page; iterate cursors for organization-wide recommendations.'};
});
export const draftInventoryPurchaseRecommendation=callable(async req=>{
 const {org,uid}=await access(req,true);
 const warehouseId=identifier(req.data?.warehouseId),sku=identifier(req.data?.sku);
 const stockRef=org.collection('warehouseStock').doc(warehouseId+'__'+sku);
 const policyRef=org.collection('inventoryAgentPolicies').doc(warehouseId+'__'+sku);
 const draftId=identifier(req.data?.draftId);
 const draftRef=org.collection('inventoryPurchaseRecommendations').doc(draftId);
 return db.runTransaction(async tx=>{
  const [existing,stock,policy]=await Promise.all([tx.get(draftRef),tx.get(stockRef),tx.get(policyRef)]);
  if(existing.exists){
   if(existing.data().sku!==sku||existing.data().warehouseId!==warehouseId)
    throw new Error('Draft ID already used');
   return {draftId,status:'already_drafted'};
  }
  if(!stock.exists||!policy.exists)throw new Error('Stock or reorder policy missing');
  const report=recommendInventoryPurchases([],[{id:stock.id,...stock.data()}],
   [{id:policy.id,...policy.data()}],1);
  const suggestion=report.recommendations[0];
  if(!suggestion)throw new Error('No reorder required under current policy');
  tx.create(draftRef,{...suggestion,status:'awaiting_procurement_approval',createdBy:uid,
   createdAt:stamp(),sourceStockQuantity:stock.data().quantity,
   sourcePolicyUpdatedAt:policy.data().updatedAt||null});
  return {draftId,status:'awaiting_procurement_approval',suggestion};
 });
});
