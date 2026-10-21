// Tenant-scoped WhatsApp outreach helpers. No automatic sends or external requests.
const E164 = /^\+[1-9]\d{7,14}$/;
const ALLOWED = new Set(['unverified', 'verified', 'opted_in', 'opted_out', 'bounced', 'contacted', 'replied']);
export function normalizePhone(phone) {
  if (typeof phone !== 'string') throw new Error('Phone must be a string');
  const number = phone.replace(/[\s()-]/g, '');
  if (!E164.test(number)) throw new Error('Supply an E.164 phone number with country code');
  return number;
}
export function validateLead(input) {
  if (!input || typeof input !== 'object') throw new Error('Lead data required');
  const name = String(input.organization || '').trim();
  if (!name || name.length > 160) throw new Error('Organization name required (up to 160 characters)');
  const phone = normalizePhone(input.phone);
  const consent = String(input.consentStatus || 'unverified');
  if (!ALLOWED.has(consent)) throw new Error('Invalid consent status');
  const source = String(input.sourceUrl || '').trim();
  if (source && (!/^https:\/\//i.test(source) || source.length > 1000)) throw new Error('Supply an HTTPS source URL');
  return {organization:name, phone, consentStatus:consent, sourceUrl:source,
    notes:String(input.notes || '').slice(0,2000)};
}
export function validateWorkspaceSender(input) {
  if (!input || typeof input !== 'object') throw new Error('Workspace sender required');
  const workspaceId=String(input.workspaceId||'').trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(workspaceId)) throw new Error('Invalid workspace ID');
  const phone=normalizePhone(input.phone);
  const displayName=String(input.displayName||'').trim();
  if (!displayName || displayName.length>120) throw new Error('Display name required');
  return {workspaceId,phone,displayName,verificationStatus:'unverified',sendingEnabled:false};
}
export function mayConfigureSender(actor, workspaceId) {
  return Boolean(actor && actor.workspaceId===workspaceId &&
    (actor.role==='owner'||actor.role==='admin') && actor.active!==false);
}
export function makeClickToChat(phone, message) {
  const number = normalizePhone(phone).slice(1);
  const text = String(message || '').trim();
  if (!text || text.length > 3000) throw new Error('Message required, maximum 3000 characters');
  return 'https://wa.me/' + number + '?text=' + encodeURIComponent(text);
}
export function outreachMessage({organization, category = 'business', locale = 'en', senderName='Your team', workspaceUrl='' } = {}) {
  const name = String(organization || 'your organization').slice(0,160);
  const sender = String(senderName).slice(0,120);
  const link = typeof workspaceUrl === 'string' && /^https:\/\//.test(workspaceUrl) ? ' ' + workspaceUrl.slice(0,500) : '';
  if (locale === 'sw') return 'Habari ' + name + ', mimi ni ' + sender + '. Ningependa kuwasiliana na msimamizi kuhusu huduma za kidijitali za ' + category + '. Je, hii ni njia sahihi ya mawasiliano ya biashara?' + link + ' Tafadhali nijulishe ikiwa hamtaki ujumbe zaidi.';
  if (locale === 'fr') return 'Bonjour ' + name + ', je représente ' + sender + '. Puis-je contacter votre responsable pour un échange sur vos besoins de gestion numérique ? Est-ce le bon canal professionnel ?' + link + ' Indiquez-moi si vous ne souhaitez plus recevoir de messages.';
  return 'Hello ' + name + ', this is ' + sender + '. May I speak with your administrator about digital ' + category + ' operations? Is this the right business contact?' + link + ' Please let me know if you prefer no further messages.';
}
export function mayAutomateSend(lead, sender) {
  return lead?.consentStatus === 'opted_in' && lead?.suppressed !== true &&
    sender?.verificationStatus === 'verified' && sender?.sendingEnabled === true &&
    Boolean(lead?.workspaceId && lead.workspaceId === sender.workspaceId);
}
