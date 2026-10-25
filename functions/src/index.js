import {initializeApp} from 'firebase-admin/app';
import {getFirestore, Timestamp, FieldValue} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {onCall, onRequest, HttpsError} from 'firebase-functions/v2/https';
import {onDocumentCreated} from 'firebase-functions/v2/firestore';
import {defineSecret} from 'firebase-functions/params';
import {randomUUID} from 'node:crypto';
import {prepareModuleRecord} from './module_records.js';
import {transitionEncounter,transitionAssessment,assessmentScore} from './vertical_workflows_domain.js';
import {requireVerticalPermission,requireRecordScope} from './vertical_permissions_domain.js';
import {validateAppointment,validateAttendance} from './vertical_operations_domain.js';
import {catalog, identifier, textValue, money, quote, canAccess, saleTotal, expandRequiredApps, sanitizeRecord} from './domain.js';
import {initializePaystack, verifyPaystack, verifyTransaction, initiateMpesa, queryMpesa} from './providers.js';
import {invoiceJournal} from './ledger_domain.js';
import {accountingPeriod, assertOpenPeriod} from './accounting_period_domain.js';
import {preparePosting} from './posting_policy_domain.js';
import {buildPosSaleSnapshot,posReceipt} from './pos_receipts_domain.js';
import {validatePosCart,pricePosCart} from './pos_cart_domain.js';
import {tillReconciliation} from './pos_till_domain.js';
import {maintenanceTicket,transitionMaintenance} from './property_maintenance_domain.js';
import {validateLease,leaseOverlaps,rentCharge} from './property_leases_domain.js';
import {propertyTenantStatement} from './property_statements_domain.js';
import {availableRentAllocation} from './property_payments_domain.js';

initializeApp();
const db = getFirestore();
const paystackSecret = defineSecret('PAYSTACK_SECRET_KEY');
const mpesaConfig = defineSecret('MPESA_CONFIG');
const geminiKey = defineSecret('GEMINI_API_KEY');
const region = 'europe-west1';
const stamp = () => FieldValue.serverTimestamp();
const root = org => db.doc(`organizations/${identifier(org)}`);

function uid(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  return request.auth.uid;
}
async function authorize(request, app, ownerOnly = false) {
  const user = uid(request);
  const org = root(request.data.orgId);
  const member = (await org.collection('members').doc(user).get()).data();
  if (!member || (ownerOnly && member.role !== 'owner')) throw new HttpsError('permission-denied', 'Organization access denied');
  if (app && !canAccess(member, app, (await org.collection('apps').doc(app).get()).data())) throw new HttpsError('permission-denied', 'App subscription or permission required');
  return {org, user, member};
}
function callable(handler, secrets = []) {
  return onCall({region, secrets}, async request => {
    try { return await handler(request); }
    catch (e) {
      if (e instanceof HttpsError) throw e;
      throw new HttpsError('failed-precondition', e.message?.startsWith('Provider') ? 'Provider unavailable; retry later' : e.message);
    }
  });
}

export const getCatalog = callable(async request => {
  uid(request);
  return {catalog, pricing: 'Provisional KES monthly prices; 10% for 3–5 apps, 20% for 6+.'};
});

export const createOrganization = callable(async request => {
  const user = uid(request);
  const name = textValue(request.data.name);
  const org = root(user);
  await db.runTransaction(async tx => {
    if ((await tx.get(org)).exists) return;
    tx.create(org, {name, createdAt: stamp(), owner: user, currency: 'KES'});
    tx.create(org.collection('members').doc(user), {role: 'owner', apps: []});
    tx.set(db.doc(`users/${user}`), {orgId: user});
  });
  return {orgId: user};
});

export const grantMember = callable(async request => {
  const {org, user} = await authorize(request, null, true);
  const target = request.data.email ? (await getAuth().getUserByEmail(textValue(request.data.email, 254))).uid : identifier(request.data.uid);
  if (target === user) throw new Error('Cannot change your own membership');
  const apps = request.data.apps;
  if (!Array.isArray(apps) || apps.some(a => !Object.hasOwn(catalog, a))) throw new Error('Invalid app permissions');
  await org.collection('members').doc(target).set({role: 'member', apps: [...new Set(apps)], updatedAt: stamp()});
  return {ok: true};
});

export const getWorkspaceContext = callable(async request => {
  const {org, user, member} = await authorize(request);
  return {orgId: org.id, uid: user, role: member.role, apps: member.apps || [], name: (await org.get()).data().name};
});

export const installApp = callable(async request => {
  const {org} = await authorize(request, null, true);
  const requested = identifier(request.data.appId);
  const appIds = expandRequiredApps([requested]);
  const refs = appIds.map(id => org.collection('apps').doc(id));
  await db.runTransaction(async tx => {
    const existing = await Promise.all(refs.map(ref => tx.get(ref)));
    existing.forEach((snap, index) => {
      if (snap.exists) return;
      const id = appIds[index];
      tx.create(refs[index], {
        appId: id,
        state: 'trial',
        installedAt: stamp(),
        installedAsDependencyOf: id === requested ? null : requested,
        expiresAt: Timestamp.fromMillis(Date.now() + 14 * 86400000),
        shares: catalog[id].shares
      });
    });
  });
  return {ok: true, installed: appIds};
});

export const uninstallApp = callable(async request => {
  const {org} = await authorize(request, null, true);
  const app = identifier(request.data.appId);
  if (!Object.hasOwn(catalog, app)) throw new Error('Unknown app');
  const installed = await org.collection('apps').get();
  const blockers = installed.docs
    .map(d => d.id)
    .filter(id => id !== app && (catalog[id]?.requires || []).includes(app));
  if (blockers.length) throw new Error(`Cannot uninstall ${app}; required by ${blockers.join(', ')}`);
  await org.collection('apps').doc(app).delete();
  return {ok: true};
});

export const getQuote = callable(async request => {
  await authorize(request, null, true);
  return quote(request.data.apps);
});

const topLevelCollectionByApp = Object.freeze({
  crm: 'contacts',
  inventory: 'products',
  hr: 'employees',
  projects: 'projects',
  helpdesk: 'tickets',
  hospital: 'patients',
  school: 'students',
  property: 'properties',
  sacco: 'sacco_members',
  marketing: 'marketing_campaigns',
  bookings: 'appointments',
  ecommerce: 'ecommerce_orders',
  procurement: 'procurement_pos',
  manufacturing: 'work_orders',
  fieldservice: 'field_dispatches',
  fleet: 'fleet_trips',
  hotel: 'hotel_rooms',
  restaurant: 'restaurant_orders',
  ngo: 'grants',
  documents: 'documents'
});

export const saveRecord = callable(async request => {
  const app = identifier(request.data.appId);
  if (!Object.hasOwn(catalog, app)) throw new Error('Unknown app');
  const {org, user} = await authorize(request, app);
  const id = identifier(request.data.id || randomUUID());
  const input = request.data.record;
  if (['pos', 'accounting', 'payments', 'etims'].includes(app)) throw new Error('Use the dedicated workflow for this app');

  let data = sanitizeRecord(input);
  let collection = org.collection(topLevelCollectionByApp[app] || app);
  if (app === 'crm') {
    data.email = input.email ? textValue(input.email, 254) : '';
  } else if (app === 'inventory') {
    data.price = money(input.price);
    if (!Number.isSafeInteger(input.stock) || input.stock < 0 || input.stock > 10000000) throw new Error('Invalid stock');
    data.stock = input.stock;
  }
  data = {...data, updatedAt: stamp(), updatedBy: user};
  if (app === 'inventory') {
    // Initial warehouse stock must be created together with the product.
    // Subsequent quantities are managed through dedicated stock transactions.
    const warehouseId = identifier(input.warehouseId || 'main');
    const warehouseRef = org.collection('warehouseStock').doc(`${warehouseId}__${id}`);
    const productRef = collection.doc(id);
    await db.runTransaction(async tx => {
      const [existing, warehouse] = await Promise.all([tx.get(productRef), tx.get(warehouseRef)]);
      if (existing.exists || warehouse.exists) {
        throw new Error('Existing inventory cannot be overwritten; use stock movement workflows');
      }
      tx.create(productRef, {...data, warehouseId, sku: id});
      tx.create(warehouseRef, {warehouseId, sku: id, quantity: input.stock, createdAt: stamp(), updatedAt: stamp()});
    });
    return {id};
  }
  await collection.doc(id).set(data, {merge: true});
  return {id};
});

export const saveModuleRecord = callable(async request => {
  const app = identifier(request.data.appId);
  const {org, user, member} = await authorize(request, app);
  // Until profession-specific clinician/educator/payroll RBAC is available,
  // sensitive records are owner-write only rather than permitting every
  // generic app member to alter prescriptions, grades or payroll.
  const ownerWriteKinds = {hospital: ['prescription', 'clinicalNote', 'labTest'],
    school: ['grade'], hr: ['payRun']};
  if (ownerWriteKinds[app]?.includes(request.data.kind) && member.role !== 'owner') {
    const assignment = (await org.collection('professionalAssignments').doc(user).get()).data();
    const permissions = {hospital:{prescription:'clinical:write',clinicalNote:'clinical:write',labTest:'lab:write'},
      school:{grade:'grade:write'}};
    const permission=permissions[app]?.[request.data.kind];
    if(!permission)throw new HttpsError('permission-denied','Owner required');
    try{requireVerticalPermission({app,member,assignment,permission});}
    catch{throw new HttpsError('permission-denied','Professional assignment required');}
  }
  const {record, reference} = prepareModuleRecord(app, request.data.kind, request.data.record);
  if(member.role!=='owner' && ((app==='hospital' && ['prescription','clinicalNote','labTest'].includes(record.kind)) ||
      (app==='school' && record.kind==='grade'))){
    const assignment=(await org.collection('professionalAssignments').doc(user).get()).data();
    let studentClass;
    if(app==='school'){
      const student=(await org.collection('students').doc(record.studentId).get()).data();
      studentClass=student?.className;
    }
    try{requireRecordScope({app,member,assignment,record,studentClass});}
    catch{throw new HttpsError('permission-denied','Record is outside professional assignment');}
  }
  const id = identifier(request.data.id || randomUUID());
  const target = org.collection('modules').doc(app).collection('records').doc(id);
  await db.runTransaction(async tx => {
    const existing = await tx.get(target);
    if (existing.exists && existing.data().kind !== record.kind) throw new Error('Record type cannot change');
    if (reference) {
      const parent = await tx.get(org.collection(reference[1]).doc(record[reference[0]]));
      if (!parent.exists) throw new Error('Select an existing record in this organization');
    }
    tx.set(target, {...record, updatedAt: stamp(), updatedBy: user,
      ...(existing.exists ? {} : {createdAt: stamp(), createdBy: user})}, {merge: true});
  });
  return {id};
});

// Separate lifecycle records retain authorization and a transition history.
// Clinical notes and student scores are not exposed in the response.
export const setProfessionalAssignment = callable(async request=>{
 const app=identifier(request.data.appId);
 if(!['hospital','school'].includes(app))throw new Error('Unsupported professional app');
 const {org,member,user}=await authorize(request,app,true);
 const staffUid=identifier(request.data.staffUid);
 const role=request.data.role;
 const options=app==='hospital'?['clinician','receptionist','lab_technician']:['teacher','principal'];
 if(!options.includes(role))throw new Error('Unknown professional role');
 if(typeof request.data.active!=='boolean')throw new Error('Active flag required');
 const staff=await org.collection('members').doc(staffUid).get();
 if(!staff.exists)throw new Error('Assign an existing organization member');
 const patientIds=request.data.patientIds??[],classNames=request.data.classNames??[];
 if(!Array.isArray(patientIds)||!Array.isArray(classNames)||patientIds.length>200||classNames.length>100)
   throw new Error('Invalid professional scope');
 const scopePatients=patientIds.map(identifier);
 const scopeClasses=classNames.map(name=>textValue(name,100));
 if((app==='hospital'&&scopeClasses.length)||(app==='school'&&scopePatients.length))
   throw new Error('Scope does not match professional app');
 await org.collection('professionalAssignments').doc(staffUid).set({
  app,role,active:request.data.active,patientIds:scopePatients,classNames:scopeClasses,
  assignedBy:user,updatedAt:stamp()
 });
 return {staffUid,app,role,active:request.data.active};
});
async function authorizeVerticalProfessional(org,member,user,app,permission){
 const assignment=(await org.collection('professionalAssignments').doc(user).get()).data();
 try{return requireVerticalPermission({app,member,assignment,permission});}
 catch{throw new HttpsError('permission-denied','Professional role or permission required');}
}
export const advanceClinicalEncounter = callable(async request => {
 const {org,user,member}=await authorize(request,'hospital');
 await authorizeVerticalProfessional(org,member,user,'hospital','encounter:advance');
 const id=identifier(request.data.encounterId),next=request.data.nextStatus;
 const ref=org.collection('clinicalEncounters').doc(id);
 return db.runTransaction(async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists)throw new Error('Encounter not found');
  const prior=snap.data();
  if(member.role!=='owner'){
   const assignment=(await tx.get(org.collection('professionalAssignments').doc(user))).data();
   try{requireRecordScope({app:'hospital',member,assignment,record:prior});}
   catch{throw new HttpsError('permission-denied','Encounter outside assigned patient roster');}
  }
  const status=transitionEncounter(prior.status,next);
  tx.update(ref,{status,updatedAt:stamp(),updatedBy:user});
  tx.create(org.collection('clinicalEncounterEvents').doc(randomUUID()),
    {encounterId:id,from:prior.status,to:status,actor:user,at:stamp()});
  return {encounterId:id,status};
 });
});
export const createClinicalEncounter = callable(async request=>{
 const {org,user,member}=await authorize(request,'hospital');
 await authorizeVerticalProfessional(org,member,user,'hospital','encounter:create');
 const id=identifier(request.data.encounterId),patientId=identifier(request.data.patientId);
 const ref=org.collection('clinicalEncounters').doc(id);
 await db.runTransaction(async tx=>{
  const patient=await tx.get(org.collection('patients').doc(patientId));
  if(!patient.exists)throw new Error('Patient not found');
  if(member.role!=='owner'){
   const assignment=(await tx.get(org.collection('professionalAssignments').doc(user))).data();
   try{requireRecordScope({app:'hospital',member,assignment,record:{patientId}});}
   catch{throw new HttpsError('permission-denied','Patient outside assigned roster');}
  }
  tx.create(ref,{patientId,status:'scheduled',createdBy:user,createdAt:stamp()});
 });
 return {encounterId:id,status:'scheduled'};
});
export const publishSchoolAssessment = callable(async request=>{
 const {org,user,member}=await authorize(request,'school');
 await authorizeVerticalProfessional(org,member,user,'school',request.data.nextStatus==='published'?'assessment:publish':'assessment:review');
 const id=identifier(request.data.assessmentId);
 const ref=org.collection('schoolAssessments').doc(id);
 return db.runTransaction(async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists)throw new Error('Assessment not found');
  if(member.role!=='owner'){
   const [student,assignment]=await Promise.all([
    tx.get(org.collection('students').doc(snap.data().studentId)),
    tx.get(org.collection('professionalAssignments').doc(user))]);
   try{requireRecordScope({app:'school',member,assignment:assignment.data(),record:snap.data(),studentClass:student.data()?.className});}
   catch{throw new HttpsError('permission-denied','Assessment outside assigned class');}
  }
  const status=transitionAssessment(snap.data().status,request.data.nextStatus);
  tx.update(ref,{status,updatedBy:user,updatedAt:stamp()});
  tx.create(org.collection('assessmentAuditEvents').doc(randomUUID()),{
   assessmentId:id,from:snap.data().status,to:status,actor:user,at:stamp()});
  return {assessmentId:id,status};
 });
});
export const createSchoolAssessment = callable(async request=>{
 const {org,user,member}=await authorize(request,'school');
 await authorizeVerticalProfessional(org,member,user,'school','assessment:create');
 const id=identifier(request.data.assessmentId),studentId=identifier(request.data.studentId);
 const result=assessmentScore(request.data.score,request.data.maxScore);
 await db.runTransaction(async tx=>{
  const student=await tx.get(org.collection('students').doc(studentId));
  if(!student.exists)throw new Error('Student not found');
  if(member.role!=='owner'){
   const assignment=(await tx.get(org.collection('professionalAssignments').doc(user))).data();
   try{requireRecordScope({app:'school',member,assignment,record:{studentId},studentClass:student.data()?.className});}
   catch{throw new HttpsError('permission-denied','Student outside assigned class');}
  }
  tx.create(org.collection('schoolAssessments').doc(id),{studentId,...result,status:'draft',
   createdBy:user,createdAt:stamp()});
 });
 return {assessmentId:id,status:'draft',percentBasisPoints:result.percentBasisPoints};
});

export const scheduleHospitalResource = callable(async request=>{
 const {org,user,member}=await authorize(request,'hospital');
 await authorizeVerticalProfessional(org,member,user,'hospital','encounter:create');
 const id=identifier(request.data.bookingId),patientId=identifier(request.data.patientId);
 const resourceId=identifier(request.data.resourceId);
 const ref=org.collection('hospitalResourceBookings').doc(id);
 const existing=await org.collection('hospitalResourceBookings').where('resourceId','==',resourceId).limit(501).get();
 if(existing.size>500)throw new Error('Resource booking scan requires pagination');
 const booking=validateAppointment({...request.data,resourceId},
   existing.docs.map(d=>d.data()));
 const patient=await org.collection('patients').doc(patientId).get();
 if(!patient.exists)throw new Error('Patient not found');
 if(member.role!=='owner'){
  const assignment=(await org.collection('professionalAssignments').doc(user).get()).data();
  try{requireRecordScope({app:'hospital',member,assignment,record:{patientId}});}
  catch{throw new HttpsError('permission-denied','Patient outside assigned roster');}
 }
 // An owner-managed schedule is a planning record; simultaneous schedulers
 // still require a serialized resource-slot lock to eliminate race conditions.
 await ref.create({...booking,patientId,status:'scheduled',createdBy:user,createdAt:stamp()});
 return {bookingId:id,status:'scheduled',conflictScanNotSerialized:true};
});
export const recordSchoolAttendance = callable(async request=>{
 const {org,user,member}=await authorize(request,'school');
 await authorizeVerticalProfessional(org,member,user,'school','assessment:create');
 const studentId=identifier(request.data.studentId);
 const result=validateAttendance({...request.data,studentId});
 const student=await org.collection('students').doc(studentId).get();
 if(!student.exists)throw new Error('Student not found');
 if(member.role!=='owner'){
  const assignment=(await org.collection('professionalAssignments').doc(user).get()).data();
  try{requireRecordScope({app:'school',member,assignment,record:{studentId},studentClass:student.data().className});}
  catch{throw new HttpsError('permission-denied','Student outside assigned class');}
 }
 const ref=org.collection('schoolAttendance').doc(studentId+'_'+result.date);
 await ref.create({...result,className:student.data().className||'',recordedBy:user,recordedAt:stamp()});
 return {studentId,date:result.date,status:result.status};
});

export const createSale = callable(async request => {
  const {org, user} = await authorize(request, 'pos');
  const id = identifier(request.data.requestId);
  const productRef = org.collection('products').doc(identifier(request.data.productId));
  const contactRef = org.collection('contacts').doc(identifier(request.data.contactId));
  const saleRef = org.collection('sales').doc(id);
  return db.runTransaction(async tx => {
    const [existing, productSnap, contactSnap] = await Promise.all([tx.get(saleRef), tx.get(productRef), tx.get(contactRef)]);
    if (existing.exists) {
      const prior = existing.data();
      if (prior.productId !== productRef.id || prior.contactId !== contactRef.id ||
          prior.quantity !== request.data.quantity) throw new Error('Sale request ID already used for different inputs');
      return {id, total: prior.total};
    }
    if (!productSnap.exists || !contactSnap.exists) throw new Error('Select an existing product and customer');
    const product = productSnap.data();
    const total = saleTotal(product, request.data.quantity);
    const warehouseId = identifier(product.warehouseId || 'main');
    const warehouseRef = org.collection('warehouseStock').doc(`${warehouseId}__${productRef.id}`);
    const warehouse = await tx.get(warehouseRef);
    if (!warehouse.exists) throw new Error('Warehouse balance missing; migrate legacy inventory before sale');
    const available = warehouse.data().quantity;
    if (!Number.isSafeInteger(available) || available < request.data.quantity) {
      throw new Error('Insufficient warehouse stock');
    }
    // When batches are tracked, use FEFO and update every chosen lot inside
    // the same transaction. Reject incomplete lot coverage rather than silently
    // bypassing traceability.
    const tracked = await tx.get(org.collection('inventoryBatches')
      .where('warehouseId', '==', warehouseId).where('sku', '==', productRef.id));
    let batchAllocations = [];
    if (!tracked.empty) {
      const {allocateBatchesFEFO} = await import('./inventory_batches_domain.js');
      batchAllocations = allocateBatchesFEFO({
        quantity: request.data.quantity,
        batches: tracked.docs.map(d => ({batchId: d.data().batchId, quantity: d.data().quantity,
          expiryAt: d.data().expiryAt || null}))
      }).allocations;
      for (const allocation of batchAllocations) {
        const lot = tracked.docs.find(d => d.data().batchId === allocation.batchId);
        tx.update(lot.ref, {quantity: lot.data().quantity - allocation.quantity, updatedAt: stamp()});
      }
    }
    tx.update(warehouseRef, {quantity: available - request.data.quantity, updatedAt: stamp()});
    tx.update(productRef, {stock: product.stock - request.data.quantity, updatedAt: stamp()});
    const receiptSnapshot=buildPosSaleSnapshot({saleId:id,productId:productRef.id,productName:product.name,contactId:contactRef.id,quantity:request.data.quantity,unitPriceMinor:product.price,totalMinor:total,warehouseId});
    tx.create(saleRef, {productId: productRef.id, contactId: contactRef.id, quantity: request.data.quantity, total, currency: 'KES', paymentState: 'unpaid', receiptSnapshot, batchAllocations, createdAt: stamp(), createdBy: user});
    tx.create(org.collection('events').doc(`sale_${id}`), {type: 'sale.created', saleId: id, createdAt: stamp()});
    return {id, total};
  });
});

export const openPosTill = callable(async request=>{
 const {org,user}=await authorize(request,'pos');
 const tillId=identifier(request.data.tillId);
 const openingMinor=money(request.data.openingMinor);
 const ref=org.collection('posTills').doc(tillId);
 await ref.create({cashierUid:user,status:'open',openingMinor,currency:'KES',openedAt:stamp()});
 return {tillId,status:'open',openingMinor};
});
export const recordPosTillMovement = callable(async request=>{
 const {org,user}=await authorize(request,'pos');
 const tillId=identifier(request.data.tillId),movementId=identifier(request.data.movementId);
 const amountMinor=money(request.data.amountMinor),type=request.data.type;
 if(!['cash_in','cash_out'].includes(type)||amountMinor<=0)throw new Error('Invalid cash movement');
 const reason=textValue(request.data.reason,200);
 const till=org.collection('posTills').doc(tillId);
 const movement=till.collection('movements').doc(movementId);
 return db.runTransaction(async tx=>{
  const [state,prior]=await Promise.all([tx.get(till),tx.get(movement)]);
  if(!state.exists||state.data().status!=='open'||state.data().cashierUid!==user)
   throw new HttpsError('permission-denied','Own open till required');
  if(prior.exists){
   if(prior.data().amountMinor!==amountMinor||prior.data().type!==type||prior.data().reason!==reason)
    throw new Error('Conflicting till movement ID');
   return {movementId,replayed:true};
  }
  tx.create(movement,{type,amountMinor,reason,cashierUid:user,createdAt:stamp(),
    verified:false,source:'manual_adjustment'});
  return {movementId,replayed:false};
 });
});
export const closePosTill = callable(async request=>{
 const {org,user}=await authorize(request,'pos');
 const tillId=identifier(request.data.tillId),countedMinor=money(request.data.countedMinor);
 const till=org.collection('posTills').doc(tillId);
 // Explicitly bounded movement list; no implicit cash attribution from unpaid
 // sales, M-Pesa initiations or unverified payment status.
 return db.runTransaction(async tx=>{
  const state=await tx.get(till);
  if(!state.exists||state.data().cashierUid!==user)
   throw new HttpsError('permission-denied','Till owner required');
  if(state.data().status==='closed'){
   if(state.data().reconciliation?.countedMinor!==countedMinor)throw new Error('Till closed with different count');
   return {tillId,...state.data().reconciliation,replayed:true};
  }
  if(state.data().status!=='open')throw new Error('Till unavailable');
  const movements=await tx.get(till.collection('movements').limit(1001));
  if(movements.size>1000)throw new Error('Till exceeds reconciliation movement limit');
  const reconciliation=tillReconciliation(state.data().openingMinor,
   movements.docs.map(doc=>doc.data()),countedMinor);
  tx.update(till,{status:'closed',closedAt:stamp(),closedBy:user,reconciliation});
  return {tillId,...reconciliation,replayed:false};
 });
});

export const createPropertyLease = callable(async request=>{
 const {org,user,member}=await authorize(request,'property');
 if(member.role!=='owner')throw new HttpsError('permission-denied','Property owner required');
 const leaseId=identifier(request.data.leaseId||randomUUID());
 const lease=validateLease(request.data),unit=org.collection('properties').doc(lease.propertyId);
 const tenant=org.collection('contacts').doc(lease.tenantId);
 const ref=org.collection('propertyLeases').doc(leaseId);
 return db.runTransaction(async tx=>{
  const [property,contact,existing,other]=await Promise.all([
   tx.get(unit),tx.get(tenant),tx.get(ref),
   tx.get(org.collection('propertyLeases').where('propertyId','==',lease.propertyId).limit(501))]);
  if(!property.exists||!contact.exists)throw new Error('Property or tenant missing');
  if(existing.exists)throw new Error('Lease ID already exists');
  if(other.size>500)throw new Error('Lease history exceeds safe overlap scan');
  if(leaseOverlaps(lease,other.docs.map(d=>d.data())))
    throw new Error('Unit already leased for these dates');
  // Serialize concurrent lease creation for the same unit through a shared
  // property-document write, so competing transactions retry their overlap scan.
  tx.update(unit,{leaseRevision:FieldValue.increment(1),leaseUpdatedAt:stamp()});
  tx.create(ref,{...lease,leaseId,createdBy:user,createdAt:stamp()});
  return {leaseId,status:'active'};
 });
});
export const issuePropertyRentCharge = callable(async request=>{
 const {org,user,member}=await authorize(request,'property');
 if(member.role!=='owner')throw new HttpsError('permission-denied','Property owner required');
 const leaseId=identifier(request.data.leaseId);
 const period=request.data.period;
 const leaseRef=org.collection('propertyLeases').doc(leaseId);
 const chargeRef=org.collection('propertyRentCharges').doc(leaseId+'_'+String(period));
 return db.runTransaction(async tx=>{
  const [leaseSnap,prior]=await Promise.all([tx.get(leaseRef),tx.get(chargeRef)]);
  if(!leaseSnap.exists)throw new Error('Lease not found');
  const charge=rentCharge(leaseSnap.data(),period);
  if(prior.exists){
   if(prior.data().amountMinor!==charge.amountMinor||
      prior.data().tenantId!==charge.tenantId)throw new Error('Rent charge conflicts with lease');
   return {chargeId:chargeRef.id,amountMinor:prior.data().amountMinor,replayed:true};
  }
  tx.create(chargeRef,{...charge,status:'issued',issuedBy:user,issuedAt:stamp()});
  return {chargeId:chargeRef.id,amountMinor:charge.amountMinor,replayed:false};
 });
});

// Payment evidence is created by a separate trusted settlement integration.
// This API cannot create or mark payment evidence as verified.
export const allocateVerifiedPropertyRent = callable(async request=>{
 const {org,user,member}=await authorize(request,'property');
 if(member.role!=='owner')throw new HttpsError('permission-denied','Property owner required');
 const paymentId=identifier(request.data.paymentId),chargeId=identifier(request.data.chargeId);
 const allocationId=identifier(request.data.allocationId);
 const amountMinor=money(request.data.amountMinor);
 const paymentRef=org.collection('verifiedRentPayments').doc(paymentId);
 const chargeRef=org.collection('propertyRentCharges').doc(chargeId);
 const allocationRef=org.collection('propertyRentAllocations').doc(allocationId);
 return db.runTransaction(async tx=>{
  const [payment,charge,prior,allocations]=await Promise.all([
   tx.get(paymentRef),tx.get(chargeRef),tx.get(allocationRef),
   tx.get(org.collection('propertyRentAllocations').where('paymentId','==',paymentId).limit(501))
  ]);
  if(!payment.exists||!charge.exists)throw new Error('Payment evidence or rent charge not found');
  if(prior.exists){
   const old=prior.data();
   if(old.paymentId!==paymentId||old.chargeId!==chargeId||old.amountMinor!==amountMinor)
    throw new Error('Conflicting allocation ID');
   return {allocationId,replayed:true};
  }
  if(allocations.size>500)throw new Error('Payment allocation history too large');
  if(payment.data().tenantId!==charge.data().tenantId)
   throw new Error('Payment and charge belong to different tenants');
  availableRentAllocation(payment.data(),allocations.docs.map(d=>d.data()),amountMinor);
  // Contention on the common payment and charge documents serializes competing allocations.
  const chargeAllocations=await tx.get(org.collection('propertyRentAllocations')
   .where('chargeId','==',chargeId).limit(501));
  if(chargeAllocations.size>500)throw new Error('Rent charge allocation history too large');
  const already=chargeAllocations.docs.reduce((sum,d)=>sum+d.data().amountMinor,0);
  if(!Number.isSafeInteger(already+amountMinor)||already+amountMinor>charge.data().amountMinor)
   throw new Error('Allocation exceeds charge outstanding');
  tx.update(paymentRef,{allocationRevision:FieldValue.increment(1)});
  tx.update(chargeRef,{allocationRevision:FieldValue.increment(1)});
  tx.create(allocationRef,{paymentId,chargeId,leaseId:charge.data().leaseId,
   tenantId:charge.data().tenantId,amountMinor,verified:true,createdBy:user,createdAt:stamp()});
  return {allocationId,replayed:false};
 });
});

export const getPropertyTenantStatement = callable(async request=>{
 const {org,member}=await authorize(request,'property');
 if(member.role!=='owner')throw new HttpsError('permission-denied','Property owner required');
 const leaseId=identifier(request.data.leaseId);
 const asOf=request.data.asOf;
 const lease=await org.collection('propertyLeases').doc(leaseId).get();
 if(!lease.exists)throw new Error('Lease not found');
 const charges=await org.collection('propertyRentCharges').where('leaseId','==',leaseId).limit(501).get();
 if(charges.size>500)throw new Error('Charge history exceeds bounded report');
 const allocations=await org.collection('propertyRentAllocations').where('leaseId','==',leaseId).limit(1001).get();
 if(allocations.size>1000)throw new Error('Allocation history exceeds bounded report');
 const statement=propertyTenantStatement(
   charges.docs.map(d=>({chargeId:d.id,...d.data()})),
   allocations.docs.map(d=>({allocationId:d.id,...d.data()})),{asOf});
 return {leaseId,tenantId:lease.data().tenantId,...statement,
  reconciliationStatus:'allocation_records_only',
  limitations:'Amounts rely on trusted externally verified rent-payment evidence; this endpoint does not independently confirm bank settlements.'};
});

export const createPropertyMaintenanceTicket = callable(async request=>{
 const {org,user}=await authorize(request,'property');
 const id=identifier(request.data.ticketId||randomUUID());
 const ticket=maintenanceTicket(request.data);
 const property=org.collection('properties').doc(ticket.propertyId);
 const ref=org.collection('propertyMaintenance').doc(id);
 await db.runTransaction(async tx=>{
  if(!(await tx.get(property)).exists)throw new Error('Property not found in workspace');
  tx.create(ref,{...ticket,createdBy:user,createdAt:stamp(),updatedAt:stamp()});
  tx.create(ref.collection('history').doc(randomUUID()),
   {action:'created',to:'open',actor:user,at:stamp()});
 });
 return {ticketId:id,status:'open'};
});
export const updatePropertyMaintenanceTicket = callable(async request=>{
 const {org,user,member}=await authorize(request,'property');
 const id=identifier(request.data.ticketId);
 const ref=org.collection('propertyMaintenance').doc(id);
 const next=request.data.status;
 return db.runTransaction(async tx=>{
  const prior=await tx.get(ref);
  if(!prior.exists)throw new Error('Maintenance ticket not found');
  // Only the creator may cancel their unassigned ticket; all other
  // lifecycle transitions are property-manager (workspace owner) actions.
  if(member.role!=='owner'&&!(next==='cancelled'&&prior.data().status==='open'&&prior.data().createdBy===user))
   throw new HttpsError('permission-denied','Property manager approval required');
  const transition=transitionMaintenance(prior.data(),next,{
   note:request.data.note??'',assigneeId:request.data.assigneeId??null});
  tx.update(ref,{status:transition.status,assigneeId:transition.assigneeId,updatedAt:stamp(),updatedBy:user,
   ...(next==='resolved'?{resolutionNote:transition.note,resolvedAt:stamp()}:{})});
  tx.create(ref.collection('history').doc(randomUUID()),{
   from:prior.data().status,to:next,actor:user,note:transition.note,at:stamp()});
  return {ticketId:id,status:next};
 });
});
export const listPropertyMaintenanceTickets = callable(async request=>{
 const {org}=await authorize(request,'property');
 const propertyId=identifier(request.data.propertyId);
 const limit=request.data.limit??50;
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('Invalid page size');
 const [property,tickets]=await Promise.all([
  org.collection('properties').doc(propertyId).get(),
  org.collection('propertyMaintenance').where('propertyId','==',propertyId).limit(limit).get()
 ]);
 if(!property.exists)throw new Error('Property not found');
 return {tickets:tickets.docs.map(doc=>({
  id:doc.id,propertyId,status:doc.data().status,priority:doc.data().priority,
  title:doc.data().title,assigneeId:doc.data().assigneeId??null
 }))};
});

export const createPosCartSale = callable(async request=>{
 const {org,user}=await authorize(request,'pos');
 const id=identifier(request.data.requestId),contactId=identifier(request.data.contactId);
 const items=validatePosCart(request.data.items);
 const saleRef=org.collection('sales').doc(id);
 const contactRef=org.collection('contacts').doc(contactId);
 const productRefs=items.map(item=>org.collection('products').doc(item.productId));
 return db.runTransaction(async tx=>{
  // Every read precedes all writes, including the FEFO batch queries.
  const [previous,customer,...products]=await Promise.all([
   tx.get(saleRef),tx.get(contactRef),...productRefs.map(ref=>tx.get(ref))]);
  if(previous.exists){
   const prior=previous.data();
   if(prior.kind!=='pos_cart'||prior.contactId!==contactId||
      JSON.stringify(prior.cartRequest)!==JSON.stringify(items))
    throw new Error('Sale request ID already used for different cart');
   return {id,total:prior.total,replayed:true};
  }
  if(!customer.exists||products.some(p=>!p.exists))throw new Error('Customer or product unavailable');
  const productsById=new Map(products.map(p=>[p.id,p.data()]));
  const priced=pricePosCart(items,productsById);
  const warehouseIds=items.map(item=>identifier(productsById.get(item.productId).warehouseId||'main'));
  const warehouseRefs=items.map((item,i)=>org.collection('warehouseStock').doc(warehouseIds[i]+'__'+item.productId));
  const [warehouses,...batchQueries]=await Promise.all([
    Promise.all(warehouseRefs.map(ref=>tx.get(ref))),
    ...items.map((item,i)=>tx.get(org.collection('inventoryBatches')
      .where('warehouseId','==',warehouseIds[i]).where('sku','==',item.productId)))
  ]);
  const {allocateBatchesFEFO}=await import('./inventory_batches_domain.js');
  const updates=[];
  const lineSnapshots=priced.lines.map((line,i)=>{
    const available=warehouses[i].data()?.quantity;
    if(!Number.isSafeInteger(available)||available<line.quantity)
      throw new Error('Insufficient warehouse stock for '+line.productId);
    const batchSnap=batchQueries[i];
    let allocations=[];
    if(!batchSnap.empty){
      allocations=allocateBatchesFEFO({quantity:line.quantity,
        batches:batchSnap.docs.map(d=>({batchId:d.data().batchId,
          quantity:d.data().quantity,expiryAt:d.data().expiryAt||null}))}).allocations;
      for(const allocation of allocations){
        const lot=batchSnap.docs.find(d=>d.data().batchId===allocation.batchId);
        updates.push({ref:lot.ref,quantity:lot.data().quantity-allocation.quantity});
      }
    }
    updates.push({ref:warehouseRefs[i],quantity:available-line.quantity});
    updates.push({ref:productRefs[i],stock:productsById.get(line.productId).stock-line.quantity});
    return {...line,warehouseId:warehouseIds[i],batchAllocations:allocations};
  });
  for(const update of updates)tx.update(update.ref,{
    ...(update.quantity!==undefined?{quantity:update.quantity}:{stock:update.stock}),updatedAt:stamp()});
  tx.create(saleRef,{kind:'pos_cart',contactId,cartRequest:items,lines:lineSnapshots,
    total:priced.total,currency:'KES',paymentState:'unpaid',
    createdAt:stamp(),createdBy:user});
  tx.create(org.collection('events').doc('sale_'+id),{type:'sale.created',saleId:id,createdAt:stamp()});
  return {id,total:priced.total,replayed:false,items:lineSnapshots.length};
 });
});

export const getPosReceipt = callable(async request=>{
 const {org}=await authorize(request,'pos');
 const saleId=identifier(request.data.saleId);
 const sale=await org.collection('sales').doc(saleId).get();
 if(!sale.exists)throw new HttpsError('not-found','Sale not found');
 return posReceipt(sale.data(),saleId);
});

export const saleAutomation = onDocumentCreated({document: 'organizations/{orgId}/events/{eventId}', region, retry: true}, async event => {
  if (event.data?.data().type !== 'sale.created') return;
  const org = root(event.params.orgId);
  const saleId = identifier(event.data.data().saleId);
  await db.runTransaction(async tx => {
    const runRef = org.collection('automationRuns').doc(event.params.eventId);
    const postingDate = new Date().toISOString().slice(0,10);
    const period = accountingPeriod(postingDate);
    const [run, saleSnap, books, crm, periodLock] = await Promise.all([
      tx.get(runRef),
      tx.get(org.collection('sales').doc(saleId)),
      tx.get(org.collection('apps').doc('accounting')),
      tx.get(org.collection('apps').doc('crm')),
      tx.get(org.collection('accountingPeriods').doc(period))
    ]);
    if (run.exists || !saleSnap.exists) return;
    const sale = saleSnap.data();
    if (books.data()?.expiresAt?.toMillis() > Date.now() && periodLock.data()?.status === 'closed') {
      tx.create(runRef, {status:'blocked_closed_period',saleId,period,blockedAt:stamp()});
      return;
    }
    if (books.data()?.expiresAt?.toMillis() > Date.now()) {
      assertOpenPeriod(period,periodLock.data());
      tx.create(org.collection('invoices').doc(saleId), {saleId, contactId: sale.contactId, total: sale.total, currency: sale.currency, paymentState: 'unpaid', status: 'draft', taxStatus: 'requires_tax_configuration', createdAt: stamp()});
      const posting = preparePosting({postingDate,periodState:periodLock.data(),sourceType:'sale',sourceId:saleId,journal:invoiceJournal(sale.total)});
      tx.create(org.collection('journals').doc(`invoice_${saleId}`), {...posting.journal,createdAt:stamp()});
      tx.create(org.collection('taxOutbox').doc(saleId), {invoiceId: saleId, status: 'blocked_configuration', provider: 'kra-etims', createdAt: stamp()});
    }
    if (crm.data()?.expiresAt?.toMillis() > Date.now()) tx.create(org.collection('tasks').doc(`followup_${saleId}`), {name: 'Follow up after sale', contactId: sale.contactId, saleId, status: 'open', createdAt: stamp()});
    tx.create(runRef, {status: 'completed', completedAt: stamp()});
  });
});

export const startSubscriptionPayment = callable(async request => {
  const {org, user} = await authorize(request, null, true);
  const pricing = quote(request.data.apps);
  const provider = request.data.provider;
  if (!['paystack', 'mpesa'].includes(provider)) throw new Error('Unknown payment provider');
  const reference = randomUUID();
  const payment = org.collection('payments').doc(reference);
  await payment.create({...pricing, provider, reference, user, state: 'initializing', createdAt: stamp()});
  await db.doc(`paymentReferences/${reference}`).create({orgId: org.id});
  try {
    if (provider === 'paystack') {
      const email = textValue(request.auth.token.email, 254);
      const result = await initializePaystack({secret: paystackSecret.value(), email, amount: pricing.total, reference});
      await payment.update({state: 'pending', authorizationUrl: result.authorization_url});
      return {reference, url: result.authorization_url};
    }
    const result = await initiateMpesa(JSON.parse(mpesaConfig.value()), {phone: textValue(request.data.phone), amount: pricing.total / 100, reference});
    await payment.update({state: 'pending_reconciliation', checkoutRequestId: result.CheckoutRequestID});
    return {reference, message: 'STK request sent. Complete payment on your phone, then select Check payment.'};
  } catch (error) {
    await payment.update({state: 'initialization_failed'});
    throw error;
  }
}, [paystackSecret, mpesaConfig]);

async function settleMpesa(org, reference, config) {
  const ref = org.collection('payments').doc(identifier(reference));
  const payment = (await ref.get()).data();
  if (!payment || payment.provider !== 'mpesa') throw new Error('M-Pesa payment not found');
  if (payment.state === 'paid') return {state: 'paid'};
  if (!payment.checkoutRequestId) throw new Error('Payment has not been initialized');
  const result = await queryMpesa(config, payment.checkoutRequestId);
  if (String(result.ResultCode) !== '0') return {state: 'pending_or_failed', message: 'No successful payment verified yet. Retry after completing the phone prompt.'};
  await db.runTransaction(async tx => {
    const fresh = await tx.get(ref);
    if (fresh.data()?.state === 'paid') return;
    const appRefs = payment.apps.map(id => org.collection('apps').doc(id));
    const installed = await Promise.all(appRefs.map(r => tx.get(r)));
    installed.forEach((snap, i) => {
      const start = snap.data()?.state === 'paid' ? Math.max(Date.now(), snap.data().expiresAt.toMillis()) : Date.now();
      tx.set(appRefs[i], {appId: payment.apps[i], state: 'paid', expiresAt: Timestamp.fromMillis(start + payment.periodDays * 86400000), shares: catalog[payment.apps[i]].shares}, {merge: true});
    });
    tx.update(ref, {state: 'paid', paidAt: stamp(), verification: 'daraja-stk-query'});
  });
  return {state: 'paid'};
}

export const checkMpesaPayment = callable(async request => {
  const {org} = await authorize(request, null, true);
  return settleMpesa(org, request.data.reference, JSON.parse(mpesaConfig.value()));
}, [mpesaConfig]);

export const mpesaCallback = onRequest({region}, (req, res) => {
  if (req.method !== 'POST') { res.sendStatus(405); return; }
  res.status(200).json({ResultCode: 0, ResultDesc: 'Accepted'});
});

export const paystackWebhook = onRequest({region, secrets: [paystackSecret]}, async (req, res) => {
  if (req.method !== 'POST') { res.sendStatus(405); return; }
  if (!verifyPaystack(req.rawBody, req.get('x-paystack-signature'), paystackSecret.value())) { res.sendStatus(401); return; }
  if (req.body?.event !== 'charge.success') { res.sendStatus(200); return; }
  try {
    const reference = identifier(req.body.data.reference);
    const mapping = (await db.doc(`paymentReferences/${reference}`).get()).data();
    if (!mapping) {
      if ((await db.doc(`resellerPaymentReferences/${reference}`).get()).exists) {
        const {settleResellerPayment} = await import('./reseller.js');
        await settleResellerPayment(reference, await verifyTransaction(paystackSecret.value(), reference));
      }
      res.sendStatus(200); return;
    }
    const verified = await verifyTransaction(paystackSecret.value(), reference);
    const org = root(mapping.orgId);
    await db.runTransaction(async tx => {
      const paymentRef = org.collection('payments').doc(reference);
      const paymentSnap = await tx.get(paymentRef);
      const payment = paymentSnap.data();
      if (!payment || payment.state === 'paid') return;
      if (verified.status !== 'success' || verified.reference !== reference || verified.amount !== payment.total || verified.currency !== payment.currency || payment.provider !== 'paystack') throw new Error('Payment mismatch');
      const appRefs = payment.apps.map(app => org.collection('apps').doc(app));
      const apps = await Promise.all(appRefs.map(ref => tx.get(ref)));
      apps.forEach((snap, i) => {
        const start = snap.data()?.state === 'paid' ? Math.max(Date.now(), snap.data().expiresAt.toMillis()) : Date.now();
        tx.set(appRefs[i], {appId: payment.apps[i], state: 'paid', expiresAt: Timestamp.fromMillis(start + payment.periodDays * 86400000), shares: catalog[payment.apps[i]].shares}, {merge: true});
      });
      tx.update(paymentRef, {state: 'paid', paidAt: stamp(), providerTransactionId: String(verified.id)});
    });
    res.sendStatus(200);
  } catch { res.sendStatus(500); }
});

export const generateReport = callable(async request => {
  const {org} = await authorize(request, null, true);
  const [sales, products, contacts] = await Promise.all([
    org.collection('sales').limit(500).get(),
    org.collection('products').limit(500).get(),
    org.collection('contacts').count().get()
  ]);
  const facts = {
    currency: 'KES',
    salesCount: sales.size,
    salesValueMinor: sales.docs.reduce((n, d) => n + d.data().total, 0),
    lowStockProducts: products.docs.filter(d => d.data().stock < 5).length,
    contacts: contacts.data().count,
    boundedToFirst500: true,
    cashCollected: 'not calculated; sales include unpaid orders'
  };
  let narrative = `${facts.salesCount} sales recorded for KES ${(facts.salesValueMinor / 100).toFixed(2)}. ${facts.lowStockProducts} products have fewer than five units. Sales totals are not collected revenue.`;
  let mode = 'deterministic';
  if (request.data.useAi === true) {
    const key = geminiKey.value();
    const model = process.env.GEMINI_MODEL;
    if (!key || !model) throw new Error('Configure GEMINI_API_KEY and GEMINI_MODEL before AI reporting');
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'x-goog-api-key': key},
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({contents: [{parts: [{text: `Write a short business operations report using only these JSON facts. Currency amounts are minor units. Do not invent trends, comparisons, tax advice or forecasts. Mention the 500-record limit and unpaid sales. Suggest 2 operational actions. Facts: ${JSON.stringify(facts)}`}]}]})
    });
    if (!response.ok) throw new Error('AI provider unavailable');
    const result = await response.json();
    narrative = result.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    if (!narrative) throw new Error('AI provider returned no report');
    mode = 'ai';
  }
  const report = {facts, narrative, mode};
  await org.collection('reports').add({...report, createdAt: stamp()});
  return report;
}, [geminiKey]);
