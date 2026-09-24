"""Replace the legacy PHP client with the reviewed Firebase client templates."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
repo = (ROOT / 'sources/Hospital-Management-System-Mobile-App').resolve()
templates = ROOT / 'templates/hospital_firebase'
backup = ROOT / 'source-recovery/Hospital-before-firebase.zip'
backup.parent.mkdir(exist_ok=True)
if not backup.exists():
    with zipfile.ZipFile(backup, 'w', zipfile.ZIP_DEFLATED) as out:
        for path in repo.rglob('*'):
            relative = path.relative_to(repo)
            if path.is_file() and not any(p in {'.git', '.dart_tool', 'build', 'node_modules', '.gradle'} for p in relative.parts):
                out.write(path, relative.as_posix())
    with zipfile.ZipFile(backup) as check:
        if check.testzip():
            raise RuntimeError('Recovery archive failed verification')
    digest = hashlib.sha256(backup.read_bytes()).hexdigest()
    (backup.with_suffix('.sha256')).write_text(digest + '\n')
if not (templates / 'lib/main.dart').exists():
    raise RuntimeError('Firebase source templates are missing')
lib = (repo / 'lib').resolve()
if lib.parent != repo or repo.parent != (ROOT / 'sources').resolve():
    raise RuntimeError('Unexpected migration target')
for path in lib.rglob('*'):
    if path.is_file():
        if not path.resolve().is_relative_to(lib):
            raise RuntimeError('File escapes hospital source')
        path.unlink()
for path in templates.rglob('*'):
    if path.is_file():
        target = repo / path.relative_to(templates)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(path.read_bytes())
settings = repo / '.vscode/settings.json'
settings.write_text(json.dumps({}, indent=2) + '\n')
print('Hospital Firebase source installed; original checkout content preserved in source-recovery.')
