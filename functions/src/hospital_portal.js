import {getFirestore, FieldValue, FieldPath} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {randomUUID} from 'node:crypto';
import {identifier, textValue, money, canAccess} from './domain.js';
import {hospitalBooking, patientRecord, assertHospitalPayment} from './hospital_domain.js';
import {paymentJournal} from './ledger_domain.js';
import {initializePaystack, verifyTransaction, initiateMpesa, queryMpesa} from './providers.js';

const region = 'europe-west1';
const paystack = defineSecret('PAYSTACK_SECRET_KEY');
const mpesa = defineSecret('MPESA_CONFIG');
const stamp = () => FieldValue.serverTimestamp();
function api(handler, secrets = []) {
  return onCall({region, secrets}, async request => {
    try { return await handler(request); }
    catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('failed-precondition', error.message || 'Request failed');
    }
  });
}
async function context(request, staff = false, needsProfile = true) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const db = getFirestore();
  const org = db.doc(`organizations/${identifier(request.data.orgId)}`);
  const installation = (await org.collection('apps').doc('hospital').get()).data();
  if (!installation || !(installation.expiresAt?.toMillis() > Date.now())) throw new HttpsError('permission-denied', 'Hospital subscription required');
  const user = request.auth.uid;
  if (staff) {
    const member = (await org.collection('members').doc(user).get()).data();
    if (!canAccess(member, 'hospital', installation)) throw new HttpsError('permission-denied', 'Hospital staff access required');
  }
  const profile = (await org.collection('hospitalPortalUsers').doc(user).get()).data();
  if (!staff && needsProfile && !profile) throw new HttpsError('failed-precondition', 'Complete patient registration first');
  return {db, org, user, profile, records: org.collection('modules').doc('hospital').collection('records')};
}

export const hospitalRegisterPatient = api(async request => {
  const {db, org, user} = await context(request, false, false);
  const name = textValue(request.data.name, 200);
  const phone = textValue(request.data.phone, 50);
  const profileRef = org.collection('hospitalPortalUsers').doc(user);
  return db.runTransaction(async tx => {
    const existing = await tx.get(profileRef);
    if (existing.exists) return {patientId: existing.data().patientId};
    const patientId = randomUUID();
    tx.create(profileRef, {patientId, createdAt: stamp()});
    tx.create(org.collection('patients').doc(patientId), {name, phone, portalUid: user, status: 'Registered', createdAt: stamp(), updatedAt: stamp()});
    return {patientId};
  });
});

export const hospitalPortalOverview = api(async request => {
  const {org, profile} = await context(request, false, false);
  if (!profile) return {registered: false};
  const patient = (await org.collection('patients').doc(profile.patientId).get()).data();
  return {registered: true, patientId: profile.patientId, name: patient?.name || ''};
});

export const hospitalListServices = api(async request => {
  const {org} = await context(request);
  const docs = await org.collection('hospitalServices').where('active', '==', true).limit(200).get();
  return {services: docs.docs.map(d => ({id: d.id, name: d.data().name, kind: d.data().kind, priceMinor: d.data().priceMinor, currency: 'KES'}))};
});

export const hospitalSaveService = api(async request => {
  const {org} = await context(request, true);
  const kind = request.data.kind;
  if (!['appointment', 'labTest'].includes(kind)) throw new Error('Invalid service kind');
  const id = identifier(request.data.id || randomUUID());
  await org.collection('hospitalServices').doc(id).set({kind, name: textValue(request.data.name),
    priceMinor: money(request.data.priceMinor), active: request.data.active !== false, updatedAt: stamp()});
  return {id};
});

export const hospitalStaffOverview = api(async request => {
  const {org, records} = await context(request, true);
  const [services, bookings] = await Promise.all([
    org.collection('hospitalServices').limit(200).get(), records.orderBy('updatedAt', 'desc').limit(100).get(),
  ]);
  return {services: services.docs.map(d => ({id: d.id, name: d.data().name, kind: d.data().kind, priceMinor: d.data().priceMinor, active: d.data().active})),
    bookings: bookings.docs.filter(d => ['appointment', 'labTest'].includes(d.data().kind)).map(d => ({id: d.id, name: d.data().name, patientId: d.data().patientId, scheduledAt: d.data().scheduledAt, status: d.data().status}))};
});

export const hospitalSetBookingStatus = api(async request => {
  const {db, records} = await context(request, true);
  if (!['confirmed', 'completed'].includes(request.data.status)) throw new Error('Invalid booking status');
  const ref = records.doc(identifier(request.data.id));
  await db.runTransaction(async tx => {
    const data = (await tx.get(ref)).data();
    if (!data || !['appointment', 'labTest'].includes(data.kind) || !['requested', 'confirmed'].includes(data.status)) throw new Error('Booking cannot be changed');
    tx.update(ref, {status: request.data.status, updatedAt: stamp()});
  });
  return {ok: true};
});

export const hospitalBook = api(async request => {
  const {db, org, user, profile, records} = await context(request);
  const id = identifier(request.data.requestId);
  const ref = records.doc(id);
  const serviceRef = org.collection('hospitalServices').doc(identifier(request.data.serviceId));
  return db.runTransaction(async tx => {
    const [existing, service] = await Promise.all([tx.get(ref), tx.get(serviceRef)]);
    if (existing.exists) {
      if (existing.data().patientId !== profile.patientId) throw new HttpsError('permission-denied', 'Booking belongs to another patient');
      if (existing.data().serviceId !== serviceRef.id || existing.data().scheduledAt !== new Date(request.data.scheduledAt).toISOString()) throw new Error('Request ID already used for another booking');
      return {id};
    }
    const booking = hospitalBooking(request.data, service.data());
    const invoiceId = `hospital_${id}`;
    tx.create(ref, {...booking, patientId: profile.patientId, invoiceId, createdAt: stamp(), updatedAt: stamp(), createdBy: user});
    tx.create(org.collection('invoices').doc(invoiceId), {name: booking.name, patientId: profile.patientId,
      source: 'hospital', recordId: id, total: booking.priceMinor, currency: 'KES', paymentState: booking.priceMinor === 0 ? 'paid' : 'unpaid', createdAt: stamp()});
    return {id};
  });
});

export const hospitalListRecords = api(async request => {
  const {profile, records} = await context(request);
  let query = records.where('patientId', '==', profile.patientId).orderBy(FieldPath.documentId()).limit(100);
  if (request.data.cursor) query = query.startAfter(identifier(request.data.cursor));
  const page = await query.get();
  return {records: page.docs.map(d => patientRecord(d.id, d.data())).filter(Boolean),
    cursor: page.size === 100 ? page.docs[page.size - 1].id : null};
});

export const hospitalUpdateBooking = api(async request => {
  const {db, org, profile, records} = await context(request);
  const ref = records.doc(identifier(request.data.id));
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (!data || data.patientId !== profile.patientId) throw new HttpsError('permission-denied', 'Booking unavailable');
    if (!['appointment', 'labTest'].includes(data.kind) || !['requested', 'confirmed'].includes(data.status)) throw new Error('Booking cannot be changed');
    const invoice = await tx.get(org.collection('invoices').doc(data.invoiceId));
    if (invoice.data()?.activePayment || invoice.data()?.paymentState === 'paid') throw new Error('Contact the hospital to change a paid booking or a booking with payment in progress');
    if (request.data.cancel === true) {
      tx.update(ref, {status: 'cancelled', updatedAt: stamp()});
      tx.update(invoice.ref, {paymentState: 'void', updatedAt: stamp()});
    } else {
      const next = hospitalBooking({...data, scheduledAt: request.data.scheduledAt}, {...data, active: true});
      tx.update(ref, {scheduledAt: next.scheduledAt, updatedAt: stamp()});
    }
  });
  return {ok: true};
});

export const hospitalReceivePrescription = api(async request => {
  const {db, profile, records} = await context(request);
  const ref = records.doc(identifier(request.data.id));
  await db.runTransaction(async tx => {
    const data = (await tx.get(ref)).data();
    if (!data || data.patientId !== profile.patientId || data.kind !== 'prescription') throw new HttpsError('permission-denied', 'Prescription unavailable');
    tx.update(ref, {received: true, receivedAt: stamp()});
  });
  return {ok: true};
});

export const hospitalListBills = api(async request => {
  const {org, profile} = await context(request);
  let query = org.collection('invoices').where('patientId', '==', profile.patientId).orderBy(FieldPath.documentId()).limit(100);
  if (request.data.cursor) query = query.startAfter(identifier(request.data.cursor));
  const page = await query.get();
  return {bills: page.docs.filter(d => d.data().source === 'hospital').map(d => ({id: d.id, name: d.data().name,
    total: d.data().total, currency: d.data().currency, paymentState: d.data().paymentState, reference: d.data().activePayment || null})),
    cursor: page.size === 100 ? page.docs[page.size - 1].id : null};
});

export const hospitalStartPayment = api(async request => {
  const {db, org, user, profile} = await context(request);
  const provider = request.data.provider;
  if (!['paystack', 'mpesa'].includes(provider)) throw new Error('Invalid payment provider');
  const invoiceRef = org.collection('invoices').doc(identifier(request.data.invoiceId));
  const reference = randomUUID();
  const paymentRef = org.collection('hospitalPayments').doc(reference);
  const payment = await db.runTransaction(async tx => {
    const invoice = (await tx.get(invoiceRef)).data();
    if (!invoice || invoice.source !== 'hospital' || invoice.patientId !== profile.patientId) throw new HttpsError('permission-denied', 'Invoice unavailable');
    if (invoice.paymentState !== 'unpaid') throw new Error('Invoice is not payable');
    if (invoice.reversedBy || invoice.kind === 'reversal' || (invoice.nettedMinor || 0) !== 0) throw new Error('Invoice has an accounting adjustment');
    if (invoice.activePayment) throw new Error('Check the existing payment before starting another');
    const total = money(invoice.total);
    if (total <= 0 || (provider === 'mpesa' && total % 100 !== 0)) throw new Error('Use Paystack for fractional shilling amounts');
    const data = {reference, provider, invoiceId: invoiceRef.id, patientId: profile.patientId, user, total, currency: 'KES', state: 'initializing'};
    tx.create(paymentRef, {...data, createdAt: stamp()});
    tx.update(invoiceRef, {activePayment: reference});
    return data;
  });
  // An uncertain provider response is not retried automatically: keep the invoice
  // reserved for reconciliation to avoid issuing a second charge after a timeout.
  try {
    if (provider === 'paystack') {
      const response = await initializePaystack({secret: paystack.value(), email: textValue(request.auth.token.email, 254), amount: payment.total, reference});
      await paymentRef.update({state: 'pending', url: response.authorization_url});
      return {reference, url: response.authorization_url};
    }
    const response = await initiateMpesa(JSON.parse(mpesa.value()), {phone: textValue(request.data.phone, 20), amount: payment.total / 100, reference, description: 'Hospital bill'});
    await paymentRef.update({state: 'pending', checkoutRequestId: response.CheckoutRequestID});
    return {reference};
  } catch {
    await paymentRef.update({state: 'needs_reconciliation'});
    throw new Error('Payment initiation needs reconciliation; check the existing payment or contact the hospital');
  }
}, [paystack, mpesa]);

export const hospitalCheckPayment = api(async request => {
  const {db, org, profile} = await context(request);
  const ref = org.collection('hospitalPayments').doc(identifier(request.data.reference));
  const payment = (await ref.get()).data();
  if (!payment || payment.patientId !== profile.patientId) throw new HttpsError('permission-denied', 'Payment unavailable');
  if (payment.state === 'paid') return {state: 'paid'};
  if (payment.provider === 'paystack') {
    const verified = await verifyTransaction(paystack.value(), ref.id);
    if (verified.status !== 'success') return {state: payment.state, url: payment.url || null};
    assertHospitalPayment(payment, verified);
  } else {
    if (!payment.checkoutRequestId) return {state: 'needs_reconciliation'};
    const verified = await queryMpesa(JSON.parse(mpesa.value()), payment.checkoutRequestId);
    if (String(verified.ResultCode) !== '0') return {state: 'pending_or_failed'};
  }
  await db.runTransaction(async tx => {
    const invoiceRef = org.collection('invoices').doc(payment.invoiceId);
    const [fresh, invoice, books] = await Promise.all([tx.get(ref), tx.get(invoiceRef), tx.get(org.collection('apps').doc('accounting'))]);
    if (fresh.data().state === 'paid') return;
    if (invoice.data()?.activePayment !== ref.id || invoice.data().total !== payment.total) throw new Error('Invoice reconciliation required');
    tx.update(ref, {state: 'paid', paidAt: stamp()});
    tx.update(invoiceRef, {paymentState: 'paid', paidAt: stamp()});
    if (books.data()?.expiresAt?.toMillis() > Date.now()) {
      tx.create(org.collection('journals').doc(`payment_${ref.id}`), {...paymentJournal(payment.total, payment.provider), source: 'hospital.payment', sourceId: ref.id, createdAt: stamp()});
    }
    tx.set(org.collection('events').doc(`hospital_payment_${ref.id}`), {type: 'hospital.payment_received', invoiceId: invoiceRef.id, createdAt: stamp()});
  });
  return {state: 'paid'};
}, [paystack, mpesa]);

export const hospitalPrepareReport = api(async request => {
  const {org, records, user} = await context(request, true);
  const patientId = identifier(request.data.patientId);
  if (!(await org.collection('patients').doc(patientId).get()).exists) throw new Error('Patient unavailable');
  const id = randomUUID();
  const path = `organizations/${org.id}/hospitalReports/${patientId}/${id}.pdf`;
  const [url] = await getStorage().bucket().file(path).getSignedUrl({version: 'v4', action: 'write', expires: Date.now() + 10 * 60000, contentType: 'application/pdf'});
  await records.doc(id).create({kind: 'labReport', name: textValue(request.data.name), patientId, storagePath: path, status: 'uploading', createdBy: user, createdAt: stamp()});
  return {id, url};
});

export const hospitalFinalizeReport = api(async request => {
  const {records} = await context(request, true);
  const ref = records.doc(identifier(request.data.id));
  const data = (await ref.get()).data();
  if (!data || data.kind !== 'labReport') throw new Error('Report unavailable');
  const [meta] = await getStorage().bucket().file(data.storagePath).getMetadata();
  if (meta.contentType !== 'application/pdf' || Number(meta.size) <= 0 || Number(meta.size) > 20 * 1024 * 1024) throw new Error('Expected a PDF up to 20 MB');
  const [header] = await getStorage().bucket().file(data.storagePath, {generation: meta.generation}).download({start: 0, end: 4});
  if (header.toString() !== '%PDF-') throw new Error('Invalid PDF header');
  await ref.update({status: 'ready', storageGeneration: meta.generation, updatedAt: stamp()});
  return {ok: true};
});

export const hospitalReportDownload = api(async request => {
  const {profile, records} = await context(request);
  const data = (await records.doc(identifier(request.data.id)).get()).data();
  if (!data || data.patientId !== profile.patientId || data.kind !== 'labReport' || data.status !== 'ready') throw new HttpsError('permission-denied', 'Report unavailable');
  const [url] = await getStorage().bucket().file(data.storagePath, {generation: data.storageGeneration}).getSignedUrl({version: 'v4', action: 'read', expires: Date.now() + 5 * 60000});
  return {url};
});
