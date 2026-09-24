"""Produce a reproducible repository inventory; never execute upstream repository code."""
import json, pathlib, re, subprocess
root = pathlib.Path(__file__).resolve().parents[1]
inventory_path = root / 'inventory/github-public-repositories.json'
raw = inventory_path.read_bytes()
try: decoded = raw.decode('utf-8-sig')
except UnicodeDecodeError: decoded = raw.decode('cp1252')
public = json.loads(decoded)
inventory_path.write_text(json.dumps(public, indent=2, ensure_ascii=False), encoding='utf-8')

categories = {
    'crm': ['ClientFlow', 'FlareLine-CRM', 'sfdx-dreamhouse'],
    'hr': ['flutter_hr_management_design', 'EWork', 'employee-attendance'],
    'hospital': ['Hospital-Management-System-Mobile-App'],
    'inventory': ['Flutter-Firebase-Inventory-Management-App'],
    'pos': ['The-POS-Flutter', 'firebase-pos', 'TallyAssist'],
    'school': ['SchoolMate-App'],
    'accounting': ['account-financial-tools', 'agora-invoicing-community', 'TallyAssist'],
    'time': ['time-tracking'],
    'property': ['wallfly', 'airbnb-clone', 'cocorico', 'fullstack-graphql-airbnb-clone', 'react-native-airbnb-clone'],
    'commerce': ['Amazon-Clone','ebay-clone','Ecommerce-CodeIgniter-Bootstrap','Grocery-Flutter-Design','L-Commerce','Multi-Vendor-E-commerce','Multivendor','nxtbn','spree','marketplacekit','marketplacekit_integration','digital-marketplace','digital-marketplace-1','digitalmarketplace-apiclient','dto-digitalmarketplace-api','crown-marketplace','vendd'],
    'transport': ['Bus-Ticket-app','redbus','GPS4'],
    'collaboration': ['CouldntShareLess','mini-google-docs-clone','community-edition','instiki','discourse','vertical-community'],
    'services': ['freelance','freelancing-market','snipe'],
    'identity': ['Identity_Verification','smart-kyc','KYB','kyc-in-vpc','kyc_beta','KYC-chain','mousekyc','oss-kyc','mycloud','blockey','HackElite'],
}
core_categories = {'crm','hr','hospital','inventory','pos','school','accounting','time'}
rows = []
for repo in public:
    name = repo['name']
    matched = [category for category, names in categories.items() if name in names]
    category = matched[0] if matched else None
    rows.append({
        'repository': repo['full_name'],
        'url': repo['html_url'],
        'fork': repo['fork'],
        'language': repo['language'],
        'category': category,
        'selection': 'core' if category in core_categories else 'adjacent' if category else 'out-of-scope',
        'cloned': (root/'sources'/name/'.git').exists()
    })

sources = []
prior_lock = {row['directory']: row for row in json.loads((root/'inventory/sources-lock.json').read_text())}
source_root = root/'sources'
source_root.mkdir(exist_ok=True)
archive_root = root/'source-archive'
folders = list(source_root.iterdir()) + (list(archive_root.iterdir()) if archive_root.exists() else [])
for folder in sorted(folders):
    if not (folder/'.git').exists():
        if (folder/'REFERENCE_MANIFEST.json').exists() and folder.name in prior_lock:
            sources.append({**prior_lock[folder.name], 'integrationStatus': 'archived_reference_only', 'checkoutPath': folder.relative_to(root).as_posix()})
        continue
    def git(*args): return subprocess.check_output(['git','-C',str(folder),*args], text=True).strip()
    pub = folder/'pubspec.yaml'
    text = pub.read_text(encoding='utf-8') if pub.exists() else ''
    sdk = re.search(r'^\s+sdk:\s*[\'\"]?([^\r\n]+)', text, re.M)
    licenses = [p.name for p in folder.iterdir() if p.is_file() and p.name.lower().startswith(('license','copying'))]
    source = {
        'directory': folder.name,
        'url': git('remote','get-url','origin'),
        'commit': git('rev-parse','HEAD'),
        'flutter': bool(text),
        'sdk': sdk.group(1) if sdk else None,
        'firebasePackages': sorted(set(re.findall(r'^\s+(firebase_\w+|cloud_firestore):',text,re.M))),
        'licenseFiles': licenses,
        'checkoutPath': folder.relative_to(root).as_posix(),
        'integrationStatus': 'archived_reference_only' if folder.parent == archive_root else 'approved_candidate' if licenses else 'license_review_required'
    }
    sources.append(source)

(root/'inventory/repository-classification.json').write_text(json.dumps(rows, indent=2), encoding='utf-8')
(root/'inventory/sources-lock.json').write_text(json.dumps(sources, indent=2), encoding='utf-8')

lines = [
    '# Repository audit', '',
    f'Public repositories inspected: {len(public)}. Local clones: {len(sources)}.', '',
    'Classification uses repository names and descriptions. Stack checks below read each clone\'s pubspec; a Firebase messaging dependency alone does not mean Firebase is its database.', '',
    '| Source | Flutter | Firebase packages | SDK | License file | Integration |',
    '|---|---|---|---|---|---|'
]
for s in sources:
    integration = 'Archived; excluded from active donors' if s['integrationStatus'] == 'archived_reference_only' else 'Reusable candidate' if s['licenseFiles'] else 'Audit only; licensing review required'
    lines.append(f"| [{s['directory']}]({s['url'].removesuffix('.git')}) | {s['flutter']} | {', '.join(s['firebasePackages']) or 'None'} | {s['sdk'] or 'N/A'} | {', '.join(s['licenseFiles']) or 'Not found; review required'} | {integration} |")
lines += [
    '',
    'TeknTandao follows a reuse-first feature-donor model. Existing repositories contribute compatible screens, workflows, calculations and tests while the suite retains one tenancy, RBAC, billing, event-bus and canonical Firestore contract.',
    '',
    'Use inventory/module-source-map.json for the approved donor mapping. Missing-license repositories remain reference-only until licensing is resolved. Adjacent commerce, property, collaboration, identity and transport repositories should be audited before equivalent modules are built from scratch.'
]
(root/'inventory/AUDIT.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')
print(f'Audited {len(public)} public repositories; {len(sources)} source clones; {sum(r["selection"] == "core" for r in rows)} core candidates.')
