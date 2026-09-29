"""Apply saved patches to clones, refusing conflicts or destructive replacement."""
from pathlib import Path
import json
import subprocess
ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT/'patches/sources/retired-files.json'
RETIRED = json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else {}
ARCHIVED_UPSTREAM = {'ClientFlow', 'The-POS-Flutter', 'account-financial-tools', 'agora-invoicing-community', 'sfdx-dreamhouse'}

def retirement_plan(repo):
    planned = []
    for entry in RETIRED.get(repo.name, []):
        relative = Path(entry['path'])
        target = repo/relative
        if relative.is_absolute() or '..' in relative.parts or not target.resolve().is_relative_to(repo.resolve()):
            raise SystemExit(f'Unsafe retired path in {repo.name}')
        if not target.exists():
            continue
        if not target.is_file() or target.is_symlink():
            raise SystemExit(f'Unexpected retired file type: {repo.name}/{relative}')
        actual = subprocess.check_output(['git', '-C', str(repo), 'hash-object', '--path='+entry['path'], str(target)], text=True).strip()
        if actual != entry['gitBlob']:
            raise SystemExit(f'Retired file has local changes: {repo.name}/{relative}; preserve and review it first')
        recovery = ROOT/'source-recovery/retired-files'/repo.name/relative
        if recovery.exists() and recovery.read_bytes() != target.read_bytes():
            raise SystemExit(f'Recovery copy differs: {repo.name}/{relative}')
        planned.append((target, recovery))
    return planned

def retire_files(planned):
    for target, recovery in planned:
        recovery.parent.mkdir(parents=True, exist_ok=True)
        if not recovery.exists():
            recovery.write_bytes(target.read_bytes())
        if recovery.read_bytes() != target.read_bytes():
            raise SystemExit('Retirement recovery verification failed')
        target.unlink()

for patch in sorted((ROOT/'patches/sources').glob('*.patch')):
    repo = ROOT/'sources'/patch.stem
    if not repo.exists() and (patch.stem in ARCHIVED_UPSTREAM or (ROOT/'source-archive'/patch.stem).is_dir()):
        print(patch.stem, 'archived; skipping patch')
        continue
    if not (repo/'.git').exists():
        raise SystemExit(f'Clone missing: {repo.name}')
    planned = retirement_plan(repo)
    command = ['git','-C',str(repo),'apply']
    if subprocess.run(command+['--reverse','--check',str(patch)],capture_output=True).returncode == 0:
        retire_files(planned)
        print(repo.name, 'already applied')
        continue
    check = subprocess.run(command+['--check',str(patch)],capture_output=True,text=True)
    if check.returncode:
        raise SystemExit(f'Cannot safely apply {repo.name}: {check.stderr}')
    subprocess.run(command+[str(patch)],check=True)
    retire_files(planned)
    print(repo.name, 'applied')
