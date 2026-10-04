import {z} from 'zod';
import {validateWebsiteDocument} from './website_builder_domain.js';

export const componentLibraryVersion = 1;
export const vettedComponents = Object.freeze([
  {id: 'brand_navigation', version: 1, name: 'Brand navigation'},
  {id: 'business_hero', version: 1, name: 'Business introduction'},
  {id: 'service_cards', version: 1, name: 'Responsive service cards'},
  {id: 'about_section', version: 1, name: 'About the business'},
  {id: 'contact_action', version: 1, name: 'Contact and call to action'},
  {id: 'business_footer', version: 1, name: 'Business footer'},
]);
export const vettedTemplates = Object.freeze([
  {id: 'business', name: 'Business essentials', category: 'Services', palette: 'emerald'},
  {id: 'clinic', name: 'Clinic and care', category: 'Healthcare', palette: 'indigo'},
  {id: 'agency', name: 'Agency and consulting', category: 'Professional services', palette: 'slate'},
  {id: 'restaurant', name: 'Restaurant and hospitality', category: 'Hospitality', palette: 'amber'},
]);
const plain = max => z.string().trim().max(max).refine(value => !/[<>]|\{\{|\}\}/.test(value), 'Use plain content, not HTML or bindings');
const contentSchema = z.object({
  brand: plain(100).pipe(z.string().min(1)), headline: plain(140).pipe(z.string().min(1)),
  summary: plain(500), actionLabel: plain(60).pipe(z.string().min(1)),
  actionUrl: z.string().max(1000).refine(value => {
    if (value === '') return true;
    try { const url = new URL(value); return ['https:', 'mailto:', 'tel:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
  }, 'Use HTTPS, email or telephone links'),
  services: z.array(z.object({title: plain(80), description: plain(300)}).strict()).min(1).max(6),
  aboutTitle: plain(100), aboutText: plain(1200),
  contactEmail: z.union([z.literal(''), z.string().email().max(254)]), phone: plain(40), address: plain(300), footer: plain(200),
}).strict();
export const websiteContentSchema = z.object({
  templateId: z.enum(['business', 'clinic', 'agency', 'restaurant']),
  palette: z.enum(['emerald', 'indigo', 'slate', 'amber']),
  content: contentSchema,
}).strict();
const str = maxLength => ({type: 'string', maxLength});
export const websiteContentJsonSchema = {
  type: 'object', additionalProperties: false, required: ['templateId', 'palette', 'content'],
  properties: {
    templateId: {type: 'string', enum: vettedTemplates.map(item => item.id)},
    palette: {type: 'string', enum: ['emerald', 'indigo', 'slate', 'amber']},
    content: {type: 'object', additionalProperties: false,
      required: ['brand', 'headline', 'summary', 'actionLabel', 'actionUrl', 'services', 'aboutTitle', 'aboutText', 'contactEmail', 'phone', 'address', 'footer'],
      properties: {brand: str(100), headline: str(140), summary: str(500), actionLabel: str(60), actionUrl: str(1000),
        services: {type: 'array', minItems: 1, maxItems: 6, items: {type: 'object', additionalProperties: false, required: ['title', 'description'], properties: {title: str(80), description: str(300)}}},
        aboutTitle: str(100), aboutText: str(1200), contactEmail: str(254), phone: str(40), address: str(300), footer: str(200)},
    },
  },
};
export const websiteContentGuide = 'Fill the supplied JSON schema with plain business content only. Choose one template and palette. Do not produce nodes, styles, layout, code, HTML, scripts, bindings or new components. Do not invent testimonials, certifications, statistics, prices, email addresses or phone numbers. Leave unknown contact fields and actionUrl empty. Keep the content grounded in the user brief.';
const palettes = {emerald: '#176B59', indigo: '#4338CA', slate: '#334155', amber: '#92400E'};

export function exampleWebsiteContent(templateId = 'business') {
  const preset = vettedTemplates.find(item => item.id === templateId);
  if (!preset) throw new Error('Unknown vetted template');
  return {templateId, palette: preset.palette, content: {brand: preset.name, headline: 'A clear introduction to your business', summary: 'Replace this sample content with your own business story.', actionLabel: 'Contact us', actionUrl: '', services: [{title: 'Your service', description: 'Explain what you provide and who you help.'}], aboutTitle: 'About us', aboutText: 'Tell visitors what makes your business useful to them.', contactEmail: '', phone: '', address: '', footer: 'Your business'} };
}

export function compileWebsiteContent(raw) {
  const blueprint = websiteContentSchema.parse(raw);
  const c = blueprint.content;
  const primary = palettes[blueprint.palette];
  const node = (id, type, props = {}, children = [], style = {}, action = {type: 'none'}) => ({id, type, props, children, style, action, responsive: {}});
  const text = (id, value) => node(id, 'text', {text: value}, [], {fontSize: 17});
  const heading = (id, value) => node(id, 'heading', {text: value}, [], {fontSize: 28, fontWeight: 700});
  const button = id => node(id, 'button', {text: c.actionLabel}, [], {}, c.actionUrl ? {type: 'externalUrl', url: c.actionUrl} : {type: 'navigate', path: '/contact'});
  const nav = prefix => node(`${prefix}_nav`, 'navbar', {brand: c.brand}, [node(`${prefix}_home_link`, 'button', {text: 'Home'}, [], {}, {type: 'navigate', path: '/'}), node(`${prefix}_contact_link`, 'button', {text: 'Contact'}, [], {}, {type: 'navigate', path: '/contact'})], {padding: 16});
  const footer = prefix => node(`${prefix}_footer`, 'footer', {copyright: c.footer}, [], {padding: 24, backgroundColor: '#F1F5F9'});
  const section = (id, children, backgroundColor = '#FFFFFF') => node(id, 'section', {}, children, {padding: 24, gap: 20, backgroundColor});
  const cards = c.services.map((service, index) => node(`service_${index}`, 'card', {}, [heading(`service_title_${index}`, service.title), text(`service_description_${index}`, service.description)], {gap: 12}));
  const services = section('services', [heading('services_title', blueprint.templateId === 'restaurant' ? 'What we offer' : 'Our services'), ...Array.from({length: Math.ceil(cards.length / 2)}, (_, i) => node(`services_row_${i}`, 'row', {}, cards.slice(i * 2, i * 2 + 2), {gap: 20}))], '#F8FAFC');
  const about = section('about', [heading('about_title', c.aboutTitle), text('about_text', c.aboutText)]);
  const hero = node('hero', 'hero', {title: c.headline, subtitle: c.summary, eyebrow: c.brand}, [button('hero_action')], {padding: 24, backgroundColor: '#F8FAFC'});
  const contact = [text('contact_address', c.address), text('contact_phone', c.phone)];
  if (c.contactEmail) contact.push(node('contact_email', 'button', {text: c.contactEmail}, [], {}, {type: 'externalUrl', url: `mailto:${c.contactEmail}`}));
  const document = validateWebsiteDocument({title: c.brand, theme: {primaryColor: primary, maxContentWidth: 1120}, settings: {language: 'en'}, pages: [
    {id: 'home', name: 'Home', path: '/', title: c.headline, description: c.summary.slice(0, 320), root: node('home_root', 'page', {}, [nav('home'), hero, ...(blueprint.templateId === 'agency' ? [about, services] : [services, about]), node('contact_cta', 'cta', {title: c.actionLabel, subtitle: c.address}, [button('cta_action')], {padding: 24}), footer('home')])},
    {id: 'contact', name: 'Contact', path: '/contact', title: `Contact ${c.brand}`, description: '', root: node('contact_root', 'page', {}, [nav('contact'), section('contact_section', [heading('contact_heading', 'Contact us'), ...contact]), footer('contact')])},
  ]});
  return {blueprint, document, componentLibraryVersion};
}

export function exportStaticWebsite(raw) {
  const {blueprint} = compileWebsiteContent(raw);
  const c = blueprint.content;
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
  const link = c.actionUrl || 'contact.html';
  const shell = body => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escape(c.summary)}"><title>${escape(c.brand)}</title><link rel="stylesheet" href="styles.css"></head><body><header><strong>${escape(c.brand)}</strong><nav><a href="index.html">Home</a><a href="contact.html">Contact</a></nav></header><main>${body}</main><footer>${escape(c.footer)}</footer></body></html>`;
  return {
    'index.html': shell(`<section><h1>${escape(c.headline)}</h1><p>${escape(c.summary)}</p><a class="button" href="${escape(link)}">${escape(c.actionLabel)}</a></section><section class="cards">${c.services.map(item => `<article><h2>${escape(item.title)}</h2><p>${escape(item.description)}</p></article>`).join('')}</section><section><h2>${escape(c.aboutTitle)}</h2><p>${escape(c.aboutText)}</p></section>`),
    'contact.html': shell(`<section><h1>Contact us</h1><p>${escape(c.address)}</p><p>${escape(c.phone)}</p>${c.contactEmail ? `<a href="mailto:${escape(c.contactEmail)}">${escape(c.contactEmail)}</a>` : ''}</section>`),
    'styles.css': `:root{--primary:${palettes[blueprint.palette]}}*{box-sizing:border-box}body{margin:0;font:18px/1.6 system-ui,sans-serif;color:#0f172a;background:#fff}header,main,footer{max-width:1120px;margin:auto;padding:24px}header,nav{display:flex;gap:24px;align-items:center;justify-content:space-between}section{padding:32px 0}h1{font-size:clamp(2rem,6vw,4rem);line-height:1.1}h2{line-height:1.3}p{overflow-wrap:anywhere}a{color:var(--primary)}.button{display:inline-block;padding:12px 20px;background:var(--primary);color:white;border-radius:8px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:24px}article{padding:24px;background:#f1f5f9;border-radius:12px}footer{border-top:1px solid #e2e8f0}@media(max-width:480px){header{align-items:flex-start;flex-direction:column}}`,
    'content.json': JSON.stringify(blueprint, null, 2),
    'README.md': 'Static site compiled from vetted components, library version 1. Serve these files on any static host. No Gemini, Firebase or JavaScript runtime is required. Domain registration and workspace apps are separate services.',
  };
}
