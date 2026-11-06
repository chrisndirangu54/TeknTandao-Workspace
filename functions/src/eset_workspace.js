// Owner-only ESET MSP connection verification for TeknTandao Workspace.
// No credential persistence, customer provisioning, endpoint actions or billing.
import './index.js';
import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {identifier} from './domain.js';
import {isBootstrapSuperAdminToken} from './super_admin_domain.js';
import {checkEsetMspAccount} from './eset_msp_client.js';

const region = 'europe-west1';
const db = getFirestore();
const username = defineSecret('ESET_MSP_USERNAME');
const password = defineSecret('ESET_MSP_PASSWORD');
const path = orgId => db.doc('organizations/' + orgId + '/securityIntegrations/eset');

async function requireOwner(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in to Workspace');
  const orgId = identifier(req.data?.orgId);
  const member = await db.doc('organizations/' + orgId + '/members/' + req.auth.uid).get();
  if (member.data()?.role !== 'owner') throw new HttpsError('permission-denied', 'Workspace owner required');
  return orgId;
}

export const getEsetIntegrationStatus = onCall({region, enforceAppCheck: true}, async req => {
  const orgId = await requireOwner(req);
  const record = (await path(orgId).get()).data() || {};
  return {
    provider: 'eset', mode: 'read_only', configured: record.status === 'verified',
    lastVerifiedAt: record.lastVerifiedAt?.toDate?.()?.toISOString?.() ?? null,
    account: record.account || null,
    canProvision: false, canManageEndpoints: false, telemetryEnabled: false,
    nextStep: record.status === 'verified' ?
      'Request and scope ESET Connect permissions and customer-to-workspace mappings.' :
      'Obtain an authorised MSP or eligible PROTECT Hub API account; configure Firebase secrets.'
  };
});

export const verifyEsetMspConnection = onCall({
  region, enforceAppCheck: true, timeoutSeconds: 45,
  secrets: [username, password]
}, async req => {
  const orgId = await requireOwner(req);
  if (!isBootstrapSuperAdminToken(req.auth.token || {}))
    throw new HttpsError('permission-denied', 'Platform operator approval required for centrally managed ESET credentials');
  if (!username.value() || !password.value())
    throw new HttpsError('failed-precondition', 'ESET MSP API secrets not configured');
  try {
    const account = await checkEsetMspAccount({
      username: username.value(), password: password.value()
    });
    // Never store access/refresh tokens, passwords, detection payloads or personal details.
    await path(orgId).set({
      provider: 'eset', status: 'verified', account,
      mode: 'read_only', verifiedBy: req.auth.uid,
      lastVerifiedAt: FieldValue.serverTimestamp()
    }, {merge: true});
    return {connected: true, account, canProvision: false, telemetryEnabled: false};
  } catch (error) {
    // Do not leak auth details or vendor responses to the browser/logs.
    throw new HttpsError('unavailable',
      error?.status === 401 || error?.status === 403 ?
        'ESET rejected the authorised API account or its permissions' :
        'ESET API verification failed; check connectivity and MSP API access');
  }
});
