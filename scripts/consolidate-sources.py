"""Archive superseded donors intact and record the selected migration sources."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARCHIVED = {
    'ClientFlow': ('sales-reports', 'FlareLine-CRM', 'Keep one CRM donor; FlareLine has explicit licensing and a responsive dashboard.'),
    'The-POS-Flutter': ('invoice-and-customer-store', 'firebase-pos', 'Prefer the Firebase/Firestore POS with offline SQLite synchronization.'),
    'account-financial-tools': ('document-reversal-and-netting', 'TallyAssist', 'Replace the Odoo/Python reference with the Flutter accounting donor.'),
    'agora-invoicing-community': ('order-payment-and-product', 'TallyAssist', 'Replace the PHP invoicing reference with the Flutter accounting donor.'),
    'sfdx-dreamhouse': ('property-and-favorite', 'FlareLine-CRM', 'Salesforce reference is outside the Flutter/Firebase runtime.'),
}

def main():
    source_root = (ROOT / 'sources').resolve()
    archive_root = (ROOT / 'source-archive').resolve()
    archive_root.mkdir(exist_ok=True)
    # Validate every target before moving anything. Never overwrite an archive.
    moves = []
    for name in ARCHIVED:
        source = (source_root / name).resolve()
        target = (archive_root / ARCHIVED[name][0]).resolve()
        if source.parent != source_root or target.parent != archive_root:
            raise RuntimeError('Source path escapes its expected directory')
        if source.exists() and target.exists():
            raise RuntimeError(f'Both source and archive exist: {name}')
        if source.exists():
            moves.append((source, target))
    for source, target in moves:
        source.rename(target)
        print(f'Archived {source.name} with local edits and Git history intact')

    map_path = ROOT / 'inventory/module-source-map.json'
    mapping = json.loads(map_path.read_text(encoding='utf-8'))
    lock_path = ROOT / 'inventory/sources-lock.json'
    locked = json.loads(lock_path.read_text(encoding='utf-8'))
    by_repo = {r['url'].removesuffix('.git').removeprefix('https://github.com/'): r.get('upstreamDirectory') or r['directory'] for r in locked}
    for module in mapping['modules'].values():
        donors = ([module['primary']] if 'primary' in module else []) + module.get('alternates', [])
        for donor in donors:
            name = by_repo.get(donor['repository'], donor['repository'].split('/')[-1])
            donor['directory'] = name
            if name in ARCHIVED:
                donor.update(status='archived_reference_only', replacement=ARCHIVED[name][1], directory=ARCHIVED[name][0])
        if module.get('primary', {}).get('status') == 'archived_reference_only':
            replacement = next((d for d in module.get('alternates', []) if d.get('status') != 'archived_reference_only'), None)
            if replacement:
                previous = module['primary']
                module['alternates'].remove(replacement)
                module['primary'] = replacement
                module['alternates'].append(previous)
    for item in locked:
        upstream = item.get('upstreamDirectory') or item['directory']
        if upstream in ARCHIVED:
            template = ARCHIVED[upstream][0]
            item['upstreamDirectory'] = upstream
            item['directory'] = template
            item['checkoutPath'] = f'source-archive/{template}'
            item['integrationStatus'] = 'archived_reference_only'
        else:
            item['checkoutPath'] = f"sources/{item['directory']}"
    map_path.write_text(json.dumps(mapping, indent=2) + '\n', encoding='utf-8')
    lock_path.write_text(json.dumps(locked, indent=2) + '\n', encoding='utf-8')
    retained = sorted(p.name for p in source_root.iterdir() if (p / 'pubspec.yaml').exists())
    references = ['EWork'] if (source_root / 'EWork').exists() else []
    workspace = {'folders': [{'path': 'apps/dashboard'}] + [{'path': f'sources/{name}'} for name in retained + references], 'settings': {}}
    (ROOT / 'sources.code-workspace').write_text(json.dumps(workspace, indent=2) + '\n', encoding='utf-8')
    report = {
        'runtime': 'apps/dashboard',
        'targetStack': ['Flutter', 'Firebase Authentication', 'Cloud Firestore', 'Cloud Functions', 'Cloud Storage'],
        'retainedDonors': retained,
        'retainedWorkflowReferences': references,
        'archived': [{'upstream': n, 'template': template, 'replacement': r, 'reason': why} for n, (template, r, why) in ARCHIVED.items()],
        'migrationStatus': 'in_progress_not_feature_complete',
        'note': 'Retained donors are references, not yet interchangeable modules of the shared runtime.'
    }
    (ROOT / 'inventory/source-consolidation.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')

if __name__ == '__main__':
    main()
