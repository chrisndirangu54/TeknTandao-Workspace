"""Apply saved patches to clones, refusing conflicts or destructive replacement."""
from pathlib import Path
import subprocess
ROOT = Path(__file__).resolve().parents[1]
ARCHIVED_UPSTREAM = {'ClientFlow', 'The-POS-Flutter', 'account-financial-tools', 'agora-invoicing-community', 'sfdx-dreamhouse'}
for patch in sorted((ROOT/'patches/sources').glob('*.patch')):
    repo = ROOT/'sources'/patch.stem
    if not repo.exists() and (patch.stem in ARCHIVED_UPSTREAM or (ROOT/'source-archive'/patch.stem).is_dir()):
        print(patch.stem, 'archived; skipping patch')
        continue
    if not (repo/'.git').exists():
        raise SystemExit(f'Clone missing: {repo.name}')
    command = ['git','-C',str(repo),'apply']
    if subprocess.run(command+['--reverse','--check',str(patch)],capture_output=True).returncode == 0:
        print(repo.name, 'already applied')
        continue
    check = subprocess.run(command+['--check',str(patch)],capture_output=True,text=True)
    if check.returncode:
        raise SystemExit(f'Cannot safely apply {repo.name}: {check.stderr}')
    subprocess.run(command+[str(patch)],check=True)
    print(repo.name, 'applied')
