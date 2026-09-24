import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {identifier, textValue, canAccess} from './domain.js';
import {validLocation, dayKey, nextPunch, monthBounds} from './attendance_domain.js';

const region = 'europe-west1';
const stamp = () => FieldValue.serverTimestamp();
function api(handler) {
  return onCall({region}, async request => {
    try { return await handler(request); }
    catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('failed-precondition', error.message || 'Request failed');
    }
  });
}
async function workplace(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const db = getFirestore();
  const org = db.doc(`organizations/${identifier(request.data.orgId)}`);
  const [installation, member] = await Promise.all([
    org.collection('apps').doc('attendance').get(), org.collection('members').doc(request.auth.uid).get(),
  ]);
  if (!canAccess(member.data(), 'attendance', installation.data())) throw new HttpsError('permission-denied', 'Attendance access required');
  return {db, org, user: request.auth.uid, email: request.auth.token.email || ''};
}
function punchView(id, data) {
  return {id, date: data.date, checkIn: data.checkIn, checkOut: data.checkOut || null,
    checkInLocation: data.checkInLocation || null, checkOutLocation: data.checkOutLocation || null};
}

export const attendanceRegister = api(async request => {
  const {db, org, user, email} = await workplace(request);
  const profile = org.collection('attendanceProfiles').doc(user);
  const general = org.collection('attendanceDepartments').doc('general');
  await db.runTransaction(async tx => {
    if (!(await tx.get(general)).exists) tx.create(general, {title: 'General', updatedAt: stamp()});
    if ((await tx.get(profile)).exists) return;
    tx.create(profile, {name: textValue(request.data.name), email, departmentId: 'general', employeeCode: user.slice(0, 8), createdAt: stamp()});
  });
  return {id: user};
});

export const attendanceProfile = api(async request => {
  const {org, user} = await workplace(request);
  const [profile, departments] = await Promise.all([
    org.collection('attendanceProfiles').doc(user).get(), org.collection('attendanceDepartments').limit(50).get(),
  ]);
  const data = profile.data();
  if (!data) return {registered: false, departments: departments.docs.map(doc => ({id: doc.id, title: doc.data().title}))};
  return {registered: true, id: user, name: data.name, email: data.email, departmentId: data.departmentId, employeeCode: data.employeeCode,
    departments: departments.docs.map(doc => ({id: doc.id, title: doc.data().title}))};
});

export const attendanceUpdateProfile = api(async request => {
  const {org, user} = await workplace(request);
  const departmentId = identifier(request.data.departmentId);
  if (!(await org.collection('attendanceDepartments').doc(departmentId).get()).exists) throw new Error('Select a department');
  await org.collection('attendanceProfiles').doc(user).update({name: textValue(request.data.name), departmentId, updatedAt: stamp()});
  return {ok: true};
});

export const attendanceSaveDepartment = api(async request => {
  const {org} = await workplace(request);
  const title = textValue(request.data.title);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const id = identifier(request.data.id || slug || 'department');
  await org.collection('attendanceDepartments').doc(id).set({title, updatedAt: stamp()});
  return {id};
});

export const attendanceToday = api(async request => {
  const {org, user} = await workplace(request);
  const id = `${user}_${dayKey(Date.now())}`;
  const snap = await org.collection('attendancePunches').doc(id).get();
  return {punch: snap.exists ? punchView(snap.id, snap.data()) : null};
});

export const attendancePunch = api(async request => {
  const {db, org, user} = await workplace(request);
  const at = new Date().toISOString();
  const day = dayKey(at);
  const ref = org.collection('attendancePunches').doc(`${user}_${day}`);
  const location = validLocation(request.data.location);
  await db.runTransaction(async tx => {
    const [profile, existing] = await Promise.all([tx.get(org.collection('attendanceProfiles').doc(user)), tx.get(ref)]);
    if (!profile.exists) throw new Error('Complete your attendance profile first');
    const next = nextPunch(existing.data(), at, location);
    if (!existing.exists) tx.create(ref, {kind: 'punch', name: profile.data().name, employeeUid: user, date: day, ...next, createdAt: stamp(), updatedAt: stamp()});
    else tx.update(ref, {...next, updatedAt: stamp()});
  });
  return {ok: true};
});

export const attendanceHistory = api(async request => {
  const {org, user} = await workplace(request);
  const {start, end} = monthBounds(request.data.month);
  const page = await org.collection('attendancePunches').where('employeeUid', '==', user).where('date', '>=', start).where('date', '<', end).orderBy('date', 'desc').limit(31).get();
  return {punches: page.docs.map(doc => punchView(doc.id, doc.data()))};
});
