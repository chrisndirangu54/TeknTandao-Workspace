import {createHash} from 'node:crypto';
import {identifier, textValue} from './domain.js';

export const websiteSchemaVersion = 1;
export const maxWebsitePages = 25;
export const maxWebsiteNodes = 600;
export const maxWebsiteDepth = 30;

export const websiteNodeTypes = Object.freeze([
  'page', 'section', 'container', 'row', 'column', 'wrap', 'stack',
  'heading', 'text', 'richText', 'image', 'button', 'icon', 'divider',
  'spacer', 'card', 'grid', 'navbar', 'hero', 'features', 'pricing',
  'testimonials', 'cta', 'footer', 'form'
]);

const nodeTypeSet = new Set(websiteNodeTypes);
const licenseTypes = new Set(['free', 'single_use', 'commercial', 'extended']);
const alignmentValues = new Set(['start', 'center', 'end', 'spaceBetween', 'spaceAround', 'spaceEvenly', 'stretch']);
const widthModes = new Set(['auto', 'fill', 'content']);
const breakpointKeys = new Set(['mobile', 'tablet', 'desktop', 'wide']);
const allowedActionTypes = new Set(['navigate', 'externalUrl', 'none']);
const hexColor = /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/;

function finiteNumber(value, label, min = -100000, max = 100000) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${label}`);
  return value;
}

function cleanString(value, max = 2000) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw new Error('Invalid text value');
  return value.trim();
}

function color(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string' || !hexColor.test(value)) throw new Error('Invalid color');
  return value.toUpperCase();
}

function scalarObject(input, maxEntries = 40) {
  if (input == null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected object');
  const entries = Object.entries(input);
  if (entries.length > maxEntries) throw new Error('Too many object fields');
  const result = {};
  for (const [rawKey, value] of entries) {
    const key = identifier(rawKey);
    if (value == null || typeof value === 'boolean') result[key] = value;
    else if (typeof value === 'string' && value.length <= 5000) result[key] = value.trim();
    else if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e9) result[key] = value;
    else throw new Error(`Unsupported field ${key}`);
  }
  return result;
}

function urlValue(value) {
  const text = cleanString(value, 2000);
  if (!text) return '';
  let parsed;
  try { parsed = new URL(text); } catch { throw new Error('Invalid URL'); }
  if (!['https:', 'http:', 'mailto:', 'tel:'].includes(parsed.protocol)) throw new Error('Unsupported URL protocol');
  return parsed.toString();
}

function validateAction(input) {
  if (input == null) return {type: 'none'};
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid action');
  const type = String(input.type || 'none');
  if (!allowedActionTypes.has(type)) throw new Error('Invalid action type');
  if (type === 'navigate') {
    const path = cleanString(input.path, 160);
    if (!path.startsWith('/')) throw new Error('Navigation path must start with /');
    return {type, path};
  }
  if (type === 'externalUrl') return {type, url: urlValue(input.url)};
  return {type: 'none'};
}

function validateResponsive(input) {
  if (input == null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid responsive settings');
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    if (!breakpointKeys.has(key)) throw new Error('Unknown responsive breakpoint');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid responsive breakpoint');
    result[key] = scalarObject(value, 20);
  }
  return result;
}

function validateStyle(input) {
  if (input == null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid style');
  const result = {};
  if (input.backgroundColor != null) result.backgroundColor = color(input.backgroundColor, '#FFFFFF');
  if (input.foregroundColor != null) result.foregroundColor = color(input.foregroundColor, '#111827');
  if (input.borderColor != null) result.borderColor = color(input.borderColor, '#E5E7EB');
  for (const key of ['padding', 'margin', 'gap', 'radius', 'fontSize', 'minHeight', 'maxWidth', 'elevation']) {
    if (input[key] != null) result[key] = finiteNumber(input[key], key, 0, key === 'fontSize' ? 240 : 5000);
  }
  if (input.fontWeight != null) {
    const weight = Number(input.fontWeight);
    if (![100,200,300,400,500,600,700,800,900].includes(weight)) throw new Error('Invalid font weight');
    result.fontWeight = weight;
  }
  if (input.alignment != null) {
    if (!alignmentValues.has(input.alignment)) throw new Error('Invalid alignment');
    result.alignment = input.alignment;
  }
  if (input.width != null) {
    if (!widthModes.has(input.width)) throw new Error('Invalid width mode');
    result.width = input.width;
  }
  if (input.hidden != null) result.hidden = input.hidden === true;
  return result;
}

function validateProps(type, input) {
  const props = scalarObject(input, 50);
  if (props.url) props.url = urlValue(props.url);
  if (props.imageUrl) props.imageUrl = urlValue(props.imageUrl);
  if (props.action) delete props.action;
  if (['heading', 'text', 'richText', 'button'].includes(type) && typeof props.text !== 'string') props.text = type === 'button' ? 'Button' : '';
  if (type === 'image' && !props.imageUrl) props.imageUrl = 'https://images.unsplash.com/photo-1497366811353-6870744d04b2';
  if (type === 'grid' && props.columns != null) {
    const columns = Number(props.columns);
    if (!Number.isInteger(columns) || columns < 1 || columns > 12) throw new Error('Invalid grid columns');
    props.columns = columns;
  }
  if (type === 'form' && props.formName != null) props.formName = cleanString(props.formName, 120);
  return props;
}

function validateNodeInternal(input, state, depth) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid website node');
  if (depth > maxWebsiteDepth) throw new Error('Website tree is too deep');
  const id = identifier(input.id);
  if (state.ids.has(id)) throw new Error(`Duplicate node id ${id}`);
  state.ids.add(id);
  state.count += 1;
  if (state.count > maxWebsiteNodes) throw new Error('Website has too many nodes');
  const type = String(input.type || '');
  if (!nodeTypeSet.has(type)) throw new Error(`Unsupported node type ${type}`);
  const childrenInput = input.children == null ? [] : input.children;
  if (!Array.isArray(childrenInput) || childrenInput.length > 80) throw new Error('Invalid node children');
  return {
    id,
    type,
    props: validateProps(type, input.props),
    style: validateStyle(input.style),
    responsive: validateResponsive(input.responsive),
    action: validateAction(input.action),
    children: childrenInput.map(child => validateNodeInternal(child, state, depth + 1))
  };
}

export function validateWebsiteNode(input) {
  return validateNodeInternal(input, {ids: new Set(), count: 0}, 0);
}

function normalizePath(value) {
  const text = cleanString(value, 160) || '/';
  if (!text.startsWith('/')) throw new Error('Page path must start with /');
  if (text !== '/' && text.endsWith('/')) return text.slice(0, -1);
  if (!/^\/[a-zA-Z0-9/_-]*$/.test(text)) throw new Error('Invalid page path');
  return text;
}

function validateTheme(input) {
  const theme = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    primaryColor: color(theme.primaryColor, '#2563EB'),
    secondaryColor: color(theme.secondaryColor, '#7C3AED'),
    backgroundColor: color(theme.backgroundColor, '#FFFFFF'),
    surfaceColor: color(theme.surfaceColor, '#F8FAFC'),
    textColor: color(theme.textColor, '#0F172A'),
    mutedTextColor: color(theme.mutedTextColor, '#64748B'),
    fontFamily: cleanString(theme.fontFamily || 'Inter', 80),
    radius: theme.radius == null ? 16 : finiteNumber(theme.radius, 'theme radius', 0, 80),
    maxContentWidth: theme.maxContentWidth == null ? 1200 : finiteNumber(theme.maxContentWidth, 'max content width', 320, 2400)
  };
}

export function validateWebsiteDocument(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid website document');
  const pagesInput = input.pages;
  if (!Array.isArray(pagesInput) || !pagesInput.length || pagesInput.length > maxWebsitePages) throw new Error('Website requires 1-25 pages');
  const pageIds = new Set();
  const paths = new Set();
  const state = {ids: new Set(), count: 0};
  const pages = pagesInput.map(page => {
    if (!page || typeof page !== 'object' || Array.isArray(page)) throw new Error('Invalid page');
    const id = identifier(page.id);
    if (pageIds.has(id)) throw new Error(`Duplicate page id ${id}`);
    pageIds.add(id);
    const path = normalizePath(page.path);
    if (paths.has(path)) throw new Error(`Duplicate page path ${path}`);
    paths.add(path);
    const root = validateNodeInternal(page.root, state, 0);
    return {
      id,
      name: textValue(page.name, 120),
      path,
      title: cleanString(page.title || page.name, 180),
      description: cleanString(page.description, 320),
      root
    };
  });
  return {
    schemaVersion: websiteSchemaVersion,
    title: textValue(input.title, 160),
    theme: validateTheme(input.theme),
    pages,
    settings: {
      language: cleanString(input.settings?.language || 'en', 16),
      direction: input.settings?.direction === 'rtl' ? 'rtl' : 'ltr',
      faviconUrl: input.settings?.faviconUrl ? urlValue(input.settings.faviconUrl) : '',
      analyticsKey: cleanString(input.settings?.analyticsKey, 160)
    }
  };
}

export function createBlankWebsiteDocument(title = 'New Website') {
  const cleanTitle = textValue(title, 160);
  return validateWebsiteDocument({
    title: cleanTitle,
    theme: {},
    settings: {},
    pages: [{
      id: 'home',
      name: 'Home',
      path: '/',
      title: cleanTitle,
      description: '',
      root: {
        id: 'home_root',
        type: 'page',
        props: {},
        style: {backgroundColor: '#FFFFFF'},
        children: [{
          id: 'hero_section',
          type: 'hero',
          props: {eyebrow: 'Built with TeknTandao', title: cleanTitle, subtitle: 'Edit this site visually. Changes publish instantly without rebuilding the Flutter app.'},
          style: {padding: 48, backgroundColor: '#F8FAFC'},
          children: [{id: 'hero_cta', type: 'button', props: {text: 'Get started'}, action: {type: 'navigate', path: '/'}, children: []}]
        }]
      }
    }]
  });
}

function cloneDocument(value) {
  return JSON.parse(JSON.stringify(value));
}

function walkNodes(node, visitor, parent = null) {
  if (visitor(node, parent) === false) return false;
  for (const child of node.children || []) if (walkNodes(child, visitor, node) === false) return false;
  return true;
}

function findNode(document, nodeId) {
  for (const page of document.pages) {
    let found = null;
    walkNodes(page.root, node => {
      if (node.id === nodeId) { found = node; return false; }
      return true;
    });
    if (found) return found;
  }
  return null;
}

function detachNode(document, nodeId) {
  for (const page of document.pages) {
    if (page.root.id === nodeId) throw new Error('Cannot move or remove a page root');
    let detached = null;
    walkNodes(page.root, node => {
      const index = (node.children || []).findIndex(child => child.id === nodeId);
      if (index >= 0) {
        [detached] = node.children.splice(index, 1);
        return false;
      }
      return true;
    });
    if (detached) return detached;
  }
  return null;
}

function mergeScalarMap(base, patch, maxEntries = 50) {
  const clean = scalarObject(patch, maxEntries);
  return {...base, ...clean};
}

export function validateWebsitePatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid website patch');
  const op = String(input.op || '');
  if (!['updateNode', 'insertNode', 'removeNode', 'moveNode', 'setTheme', 'updatePage'].includes(op)) throw new Error('Unknown website patch operation');
  if (op === 'updateNode') return {op, nodeId: identifier(input.nodeId), props: scalarObject(input.props, 50), style: validateStyle(input.style), responsive: validateResponsive(input.responsive), action: input.action == null ? null : validateAction(input.action)};
  if (op === 'insertNode') return {op, parentId: identifier(input.parentId), index: Number.isInteger(input.index) ? input.index : 9999, node: validateWebsiteNode(input.node)};
  if (op === 'removeNode') return {op, nodeId: identifier(input.nodeId)};
  if (op === 'moveNode') return {op, nodeId: identifier(input.nodeId), parentId: identifier(input.parentId), index: Number.isInteger(input.index) ? input.index : 9999};
  if (op === 'setTheme') return {op, theme: validateTheme(input.theme)};
  return {
    op,
    pageId: identifier(input.pageId),
    changes: {
      ...(input.changes?.name != null ? {name: textValue(input.changes.name, 120)} : {}),
      ...(input.changes?.path != null ? {path: normalizePath(input.changes.path)} : {}),
      ...(input.changes?.title != null ? {title: cleanString(input.changes.title, 180)} : {}),
      ...(input.changes?.description != null ? {description: cleanString(input.changes.description, 320)} : {})
    }
  };
}

export function applyWebsitePatch(documentInput, patchInput) {
  const document = cloneDocument(validateWebsiteDocument(documentInput));
  const patch = validateWebsitePatch(patchInput);
  if (patch.op === 'setTheme') document.theme = patch.theme;
  else if (patch.op === 'updatePage') {
    const page = document.pages.find(item => item.id === patch.pageId);
    if (!page) throw new Error('Page not found');
    Object.assign(page, patch.changes);
  } else if (patch.op === 'updateNode') {
    const node = findNode(document, patch.nodeId);
    if (!node) throw new Error('Node not found');
    node.props = mergeScalarMap(node.props, patch.props);
    node.style = {...node.style, ...patch.style};
    node.responsive = {...node.responsive, ...patch.responsive};
    if (patch.action) node.action = patch.action;
  } else if (patch.op === 'insertNode') {
    if (findNode(document, patch.node.id)) throw new Error('Node id already exists');
    const parent = findNode(document, patch.parentId);
    if (!parent) throw new Error('Parent node not found');
    const index = Math.max(0, Math.min(patch.index, parent.children.length));
    parent.children.splice(index, 0, patch.node);
  } else if (patch.op === 'removeNode') {
    if (!detachNode(document, patch.nodeId)) throw new Error('Node not found');
  } else if (patch.op === 'moveNode') {
    const moved = detachNode(document, patch.nodeId);
    if (!moved) throw new Error('Node not found');
    const parent = findNode(document, patch.parentId);
    if (!parent) throw new Error('Target parent not found');
    let cyclic = false;
    walkNodes(moved, node => {
      if (node.id === parent.id) cyclic = true;
      return !cyclic;
    });
    if (cyclic) throw new Error('Cannot move a node into its own subtree');
    const index = Math.max(0, Math.min(patch.index, parent.children.length));
    parent.children.splice(index, 0, moved);
  }
  return validateWebsiteDocument(document);
}

export function websiteDigest(document) {
  const validated = validateWebsiteDocument(document);
  return createHash('sha256').update(JSON.stringify(validated)).digest('hex');
}

export function validateWebsiteTemplateMetadata(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid template metadata');
  const priceMinor = input.priceMinor ?? 0;
  if (!Number.isSafeInteger(priceMinor) || priceMinor < 0 || priceMinor > 100000000) throw new Error('Invalid template price');
  const license = String(input.license || (priceMinor === 0 ? 'free' : 'single_use'));
  if (!licenseTypes.has(license)) throw new Error('Invalid template license');
  const tags = Array.isArray(input.tags) ? [...new Set(input.tags.map(tag => cleanString(tag, 40).toLowerCase()).filter(Boolean))].slice(0, 12) : [];
  return {
    name: textValue(input.name, 120),
    description: textValue(input.description, 800),
    category: textValue(input.category || 'Business', 80),
    creatorName: textValue(input.creatorName, 120),
    priceMinor,
    currency: 'KES',
    license,
    tags
  };
}

function dartString(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n').replaceAll('\r', '');
}

export function generateFlutterFirebaseScaffold(publicId, documentInput) {
  const document = validateWebsiteDocument(documentInput);
  const siteJson = JSON.stringify(document);
  const mainDart = `import 'dart:convert';\nimport 'package:cloud_firestore/cloud_firestore.dart';\nimport 'package:firebase_core/firebase_core.dart';\nimport 'package:flutter/material.dart';\n\nFuture<void> main() async {\n  WidgetsFlutterBinding.ensureInitialized();\n  await Firebase.initializeApp();\n  runApp(const GeneratedWebsite());\n}\n\nclass GeneratedWebsite extends StatelessWidget {\n  const GeneratedWebsite({super.key});\n  @override\n  Widget build(BuildContext context) => MaterialApp(\n    debugShowCheckedModeBanner: false,\n    home: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(\n      stream: FirebaseFirestore.instance.doc('publishedWebsiteSites/${dartString(publicId)}').snapshots(),\n      builder: (context, snapshot) {\n        final remote = snapshot.data?.data()?['document'];\n        final data = remote is Map ? Map<String, dynamic>.from(remote) : jsonDecode(kBundledSiteJson) as Map<String, dynamic>;\n        return JsonSiteRuntime(document: data);\n      },\n    ),\n  );\n}\n\nclass JsonSiteRuntime extends StatelessWidget {\n  final Map<String, dynamic> document;\n  const JsonSiteRuntime({super.key, required this.document});\n  @override\n  Widget build(BuildContext context) {\n    final pages = (document['pages'] as List? ?? const []);\n    if (pages.isEmpty) return const Scaffold(body: Center(child: Text('No page')));\n    final page = Map<String, dynamic>.from(pages.first as Map);\n    return Scaffold(body: SingleChildScrollView(child: _node(Map<String, dynamic>.from(page['root'] as Map))));\n  }\n  Widget _node(Map<String, dynamic> node) {\n    final type = node['type']?.toString() ?? 'text';\n    final props = Map<String, dynamic>.from(node['props'] as Map? ?? const {});\n    final children = (node['children'] as List? ?? const []).map((e) => _node(Map<String, dynamic>.from(e as Map))).toList();\n    switch (type) {\n      case 'heading': return Padding(padding: const EdgeInsets.all(8), child: Text(props['text']?.toString() ?? '', style: const TextStyle(fontSize: 36, fontWeight: FontWeight.bold)));\n      case 'text': case 'richText': return Padding(padding: const EdgeInsets.all(8), child: Text(props['text']?.toString() ?? ''));\n      case 'image': return Image.network(props['imageUrl']?.toString() ?? '', fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox.shrink());\n      case 'button': return Padding(padding: const EdgeInsets.all(8), child: FilledButton(onPressed: () {}, child: Text(props['text']?.toString() ?? 'Button')));\n      case 'row': return Row(children: children.map((w) => Flexible(child: w)).toList());\n      case 'grid': return GridView.count(crossAxisCount: (props['columns'] as num?)?.toInt() ?? 3, shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), children: children);\n      case 'divider': return const Divider();\n      case 'spacer': return SizedBox(height: (props['height'] as num?)?.toDouble() ?? 24);\n      default: return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children);\n    }\n  }\n}\n\nconst kBundledSiteJson = '${dartString(siteJson)}';\n`;
  return {
    'pubspec.yaml': `name: generated_website\ndescription: Generated by TeknTandao Website Builder\npublish_to: none\nenvironment:\n  sdk: '>=3.6.0 <4.0.0'\ndependencies:\n  flutter:\n    sdk: flutter\n  firebase_core: ^4.0.0\n  cloud_firestore: ^6.0.0\nflutter:\n  uses-material-design: true\n`,
    'lib/main.dart': mainDart,
    'assets/site.json': `${JSON.stringify(document, null, 2)}\n`,
    'firebase.json': `${JSON.stringify({hosting: {public: 'build/web', ignore: ['firebase.json', '**/.*', '**/node_modules/**'], rewrites: [{source: '**', destination: '/index.html'}]}}, null, 2)}\n`,
    'README.md': `# ${document.title}\n\nGenerated by TeknTandao Website Builder. The bundled JSON is a fallback. In production the app listens to publishedWebsiteSites/${publicId}, so publishing a new JSON version updates the UI without rebuilding the Flutter binary.\n`
  };
}
