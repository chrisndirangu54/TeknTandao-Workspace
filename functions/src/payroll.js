import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {identifier, canAccess} from './domain.js';
import {statutoryPayroll} from './payroll_domain.js';
import {payrollJournal} from './ledger_domain.js';

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

export const runStatutoryPayroll = api(async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const db = getFirestore();
  const org = db.doc(`organizations/${identifier(request.data.orgId)}`);
  const employeeId = identifier(request.data.employeeId);
  const period = request.data.period;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Period must be YYYY-MM');
  const [payrollApp, books, member, employee] = await Promise.all([
    org.collection('apps').doc('payroll').get(),
    org.collection('apps').doc('accounting').get(),
    org.collection('members').doc(request.auth.uid).get(),
    org.collection('employees').doc(employeeId).get(),
  ]);
  const now = Date.now();
  if (!canAccess(member.data(), 'payroll', payrollApp.data(), now)) throw new HttpsError('permission-denied', 'Payroll access required');
  if (!(books.data()?.expiresAt?.toMillis() > now)) throw new Error('Install Books before posting payroll');
  if (!employee.exists) throw new Error('Select an existing employee');
  const slip = {...statutoryPayroll(request.data.grossMinor), employeeId, period, employeeName: employee.data().name || employeeId};
  const payslipRef = org.collection('payrollPayslips').doc(`pay_${employeeId}_${period}`);
  const journalRef = org.collection('journals').doc(payslipRef.id);
  await db.runTransaction(async tx => {
    if ((await tx.get(payslipRef)).exists) return;
    tx.create(payslipRef, {...slip, createdBy: request.auth.uid, createdAt: stamp()});
    tx.create(journalRef, {...payrollJournal(slip), source: 'payroll', sourceId: payslipRef.id, createdAt: stamp()});
  });
  const saved = (await payslipRef.get()).data();
  return {id: payslipRef.id, rateCard: saved.rateCard, netMinor: saved.netMinor, payeMinor: saved.payeMinor, nssfEmployeeMinor: saved.nssfEmployeeMinor, shifMinor: saved.shifMinor, housingEmployeeMinor: saved.housingEmployeeMinor};
});
