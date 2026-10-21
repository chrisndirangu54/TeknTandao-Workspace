// Consent-aware outreach helpers. No automatic sends or third-party requests.
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
export function makeClickToChat(phone, message) {
  const number = normalizePhone(phone).slice(1);
  const text = String(message || '').trim();
  if (!text || text.length > 3000) throw new Error('Message required, maximum 3000 characters');
  return 'https://wa.me/' + number + '?text=' + encodeURIComponent(text);
}
export function outreachMessage({organization, category = 'business', locale = 'en'} = {}) {
  const name = String(organization || 'your organization').slice(0,160);
  if (locale === 'sw') return 'Habari ' + name + ', mimi ni Chris Mwangi Ndirangu wa TeknTandao. Ningependa kuwasiliana na msimamizi kuhusu uwezekano wa mazungumzo mafupi juu ya mifumo ya usimamizi wa ' + category + '. Je, hii ni njia sahihi ya mawasiliano ya biashara? TeknTandao Workspace: https://tekntandaoworkspace.web.app/ | Wasifu: https://www.linkedin.com/in/chris-mwangi-abb36615b/ Tafadhali nijulishe ikiwa hamtaki ujumbe zaidi.';
  if (locale === 'fr') return 'Bonjour ' + name + ', je suis Chris Mwangi Ndirangu, fondateur de TeknTandao. Puis-je contacter votre responsable pour un bref échange sur vos besoins de gestion numérique ? Est-ce le bon canal professionnel ? TeknTandao Workspace : https://tekntandaoworkspace.web.app/ | LinkedIn : https://www.linkedin.com/in/chris-mwangi-abb36615b/ Indiquez-moi si vous ne souhaitez plus recevoir de messages.';
  return 'Hello ' + name + ', I am Chris Mwangi Ndirangu, founder of TeknTandao. May I speak with your administrator about a brief discussion of digital ' + category + ' operations? Is this the right business contact? TeknTandao Workspace: https://tekntandaoworkspace.web.app/ | LinkedIn: https://www.linkedin.com/in/chris-mwangi-abb36615b/ Please let me know if you prefer no further messages.';
}
export function mayAutomateSend(lead) {
  return lead?.consentStatus === 'opted_in' && lead?.suppressed !== true;
}
