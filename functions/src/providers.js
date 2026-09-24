import {createHmac, timingSafeEqual} from 'node:crypto';
async function jsonFetch(url, options) {
  const response = await fetch(url, {...options, signal: AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
  return response.json();
}
export function verifyPaystack(raw, signature, secret) {
  if (!secret || typeof signature !== 'string' || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = createHmac('sha512', secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
export async function initializePaystack({secret, email, amount, reference}) {
  if (!secret) throw new Error('Paystack is not configured');
  const r = await jsonFetch('https://api.paystack.co/transaction/initialize', {method: 'POST', headers: {Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json'}, body: JSON.stringify({email, amount, currency: 'KES', reference})});
  if (!r.status || !r.data?.authorization_url) throw new Error('Paystack initialization failed');
  return r.data;
}
export async function verifyTransaction(secret, reference) {
  const r = await jsonFetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {headers: {Authorization: `Bearer ${secret}`}});
  if (!r.status) throw new Error('Payment verification failed');
  return r.data;
}
export async function initiateMpesa(config, {phone, amount, reference, description = 'Tandao subscription'}) {
  if (!/^254[17]\d{8}$/.test(phone)) throw new Error('Use a Kenyan phone number starting 254');
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('M-Pesa amount must be positive whole shillings');
  const {key, secret, shortcode, passkey, callbackUrl} = config;
  if (![key, secret, shortcode, passkey, callbackUrl].every(Boolean) || !callbackUrl.startsWith('https://')) throw new Error('M-Pesa is not configured');
  const base = config.live ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
  const auth = await jsonFetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {headers: {Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`}});
  const timestamp = new Date().toLocaleString('sv-SE', {timeZone: 'Africa/Nairobi'}).replace(/\D/g, '');
  const r = await jsonFetch(`${base}/mpesa/stkpush/v1/processrequest`, {method: 'POST', headers: {Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json'}, body: JSON.stringify({BusinessShortCode: shortcode, Password: Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64'), Timestamp: timestamp, TransactionType: 'CustomerPayBillOnline', Amount: amount, PartyA: phone, PartyB: shortcode, PhoneNumber: phone, CallBackURL: callbackUrl, AccountReference: reference.slice(0, 12), TransactionDesc: description})});
  if (r.ResponseCode !== '0') throw new Error('M-Pesa request rejected');
  return r;
}
export async function queryMpesa(config, checkoutRequestId) {
  const base = config.live ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
  const auth = await jsonFetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {headers: {Authorization: `Basic ${Buffer.from(`${config.key}:${config.secret}`).toString('base64')}`}});
  const timestamp = new Date().toLocaleString('sv-SE', {timeZone: 'Africa/Nairobi'}).replace(/\D/g, '');
  return jsonFetch(`${base}/mpesa/stkpushquery/v1/query`, {method: 'POST', headers: {Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json'}, body: JSON.stringify({BusinessShortCode: config.shortcode, Password: Buffer.from(`${config.shortcode}${config.passkey}${timestamp}`).toString('base64'), Timestamp: timestamp, CheckoutRequestID: checkoutRequestId})});
}
