import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {identifier, textValue, optionalText, canAccess} from './domain.js';

export const mutateTimeRecord = onCall({region: 'europe-west1'}, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  try {
    const db = getFirestore();
    const org = db.doc(`organizations/${identifier(request.data.orgId)}`);
    const user = request.auth.uid;
    const [member, app] = await Promise.all([org.collection('members').doc(user).get(), org.collection('apps').doc('time').get()]);
    if (!canAccess(member.data(), 'time', app.data())) throw new HttpsError('permission-denied', 'Time tracking access required');
    const kind = request.data.kind;
    const action = request.data.action;
    if (!['jobs', 'entries'].includes(kind) || !['save', 'delete'].includes(action)) throw new Error('Invalid time operation');
    const base = org.collection('timeMembers').doc(user);
    const target = base.collection(kind).doc(identifier(request.data.id));
    return await db.runTransaction(async tx => {
      const existing = await tx.get(target);
      if (action === 'delete') {
        if (!existing.exists) return {ok: true};
        if (kind === 'jobs') {
          const entries = await tx.get(base.collection('entries').where('jobId', '==', target.id).limit(401));
          if (entries.size > 400) throw new Error('Remove time entries before deleting a job with more than 400 entries');
          entries.docs.forEach(doc => tx.delete(doc.ref));
        }
        tx.delete(target);
        return {ok: true};
      }
      const input = request.data.record;
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid time record');
      let data;
      if (kind === 'jobs') {
        if (!Number.isSafeInteger(input.ratePerHour) || input.ratePerHour < 0 || input.ratePerHour > 1000000) throw new Error('Invalid hourly rate');
        data = {name: textValue(input.name, 200), ratePerHour: input.ratePerHour};
      } else {
        const jobId = identifier(input.jobId);
        if (!(await tx.get(base.collection('jobs').doc(jobId))).exists) throw new Error('Select one of your jobs');
        if (![input.start, input.end].every(Number.isSafeInteger) || input.start < 0 || input.end > 8640000000000000 || input.end <= input.start || input.end - input.start > 7 * 86400000) throw new Error('Invalid time range (maximum seven days)');
        data = {jobId, start: input.start, end: input.end, comment: optionalText(input.comment ?? '', 4000)};
      }
      tx.set(target, {...data, updatedBy: user, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      return {id: target.id};
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('invalid-argument', error.message);
  }
});
