"""Produce a reproducible inventory; never execute any upstream repository code."""
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
    'hr': ['flutter_hr_management_design', 'EWork'],
    'hospital': ['Hospital-Management-System-Mobile-App'],
    'inventory': ['Flutter-Firebase-Inventory-Management-App'],
    'pos': ['The-POS-Flutter'],
    'school': ['SchoolMate-App'],
    'accounting': ['account-financial-tools', 'agora-invoicing-community'],
    'property': ['wallfly', 'airbnb-clone', 'cocorico', 'fullstack-graphql-airbnb-clone', 'react-native-airbnb-clone'],
    'commerce': ['Amazon-Clone','ebay-clone','Ecommerce-CodeIgniter-Bootstrap','Grocery-Flutter-Design','L-Commerce','Multi-Vendor-E-commerce','Multivendor','nxtbn','spree','marketplacekit','marketplacekit_integration','digital-marketplace','digital-marketplace-1','digitalmarketplace-apiclient','dto-digitalmarketplace-api','crown-marketplace','vendd'],
    'transport': ['Bus-Ticket-app','redbus','GPS4'],
    'collaboration': ['CouldntShareLess','mini-google-docs-clone','community-edition','instiki','discourse','vertical-community'],
    'services': ['freelance','freelancing-market','snipe'],
    'identity': ['Identity_Verification','smart-kyc','KYB','kyc-in-vpc','kyc_beta','KYC-chain','mousekyc','oss-kyc','mycloud','blockey','HackElite'],
}
rows = []
for repo in public:
    name = repo['name']
    category = next((category for category, names in categories.items() if name in names), None)
    rows.append({'repository': repo['full_name'], 'url': repo['html_url'], 'fork': repo['fork'], 'language': repo['language'], 'category': category, 'selection': 'core' if category in ['crm','hr','hospital','inventory','pos','school','accounting'] else 'adjacent' if category else 'out-of-scope', 'cloned': (root/'sources'/name/'.git').exists()})
sources = []
for folder in sorted((root/'sources').iterdir()):
    if not (folder/'.git').exists(): continue
    def git(*args): return subprocess.check_output(['git','-C',str(folder),*args], text=True).strip()
    pub = folder/'pubspec.yaml'
    text = pub.read_text(encoding='utf-8') if pub.exists() else ''
    sdk = re.search(r'^\s+sdk:\s*[\'\"]?([^\r\n]+)', text, re.M)
    licenses = [p.name for p in folder.iterdir() if p.is_file() and p.name.lower().startswith(('license','copying'))]
    source = {'directory': folder.name, 'url': git('remote','get-url','origin'), 'commit': git('rev-parse','HEAD'), 'flutter': bool(text), 'sdk': sdk.group(1) if sdk else None, 'firebasePackages': sorted(set(re.findall(r'^\s+(firebase_\w+|cloud_firestore):',text,re.M))), 'licenseFiles': licenses, 'integrationStatus': 'cloned_for_audit_not_migrated'}
    sources.append(source)
(root/'inventory/repository-classification.json').write_text(json.dumps(rows, indent=2), encoding='utf-8')
(root/'inventory/sources-lock.json').write_text(json.dumps(sources, indent=2), encoding='utf-8')
lines = ['# Repository audit', '', f'Public repositories inspected: {len(public)}. Local clones: {len(sources)}.', '', 'Classification uses repository names and descriptions. Stack checks below read each clone\'s pubspec; a Firebase messaging dependency alone does not mean Firebase is its database.', '', '| Source | Flutter | Firebase packages | SDK | License file | Integration |', '|---|---|---|---|---|---|']
for s in sources:
    lines.append(f"| [{s['directory']}]({s['url'].removesuffix('.git')}) | {s['flutter']} | {', '.join(s['firebasePackages']) or 'None'} | {s['sdk'] or 'N/A'} | {', '.join(s['licenseFiles']) or 'Not found; review required'} | Audit clone; migration pending |")
lines += ['', 'The suite under apps/dashboard and functions is new code. Cloned upstream screens have not been merged into it. License notices remain in the clones. Missing license files and dependency-specific licenses must be resolved before redistributing upstream code.', '', 'Adjacent commerce, property, collaboration, identity and transport repositories are classified separately in repository-classification.json; they have not all been cloned or integrated.']
(root/'inventory/AUDIT.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')
print(f'Audited {len(public)} public repositories; {len(sources)} source clones; {sum(r["selection"] == "core" for r in rows)} core candidates.')
