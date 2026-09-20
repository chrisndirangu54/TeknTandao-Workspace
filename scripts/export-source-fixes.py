"""Keep donor repairs reviewable without vendoring whole upstream repositories."""
import difflib
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'patches/sources'
OUT.mkdir(parents=True, exist_ok=True)
for folder in (ROOT/'sources').iterdir():
    if not (folder/'pubspec.yaml').exists(): continue
    result = subprocess.run(['git','-C',str(folder),'diff','--','pubspec.yaml','lib','.vscode/settings.json'], capture_output=True, text=True, encoding='utf-8', errors='replace', check=True)
    patch = result.stdout
    for relative in ['lib/firebase_options.dart','.vscode/settings.json']:
        path = folder/relative
        tracked = subprocess.run(['git','-C',str(folder),'ls-files','--error-unmatch',relative], capture_output=True).returncode == 0
        if path.exists() and not tracked and (folder.name == 'time-tracking' or folder.name in ['Hospital-Management-System-Mobile-App','TallyAssist']):
            patch += f'diff --git a/{relative} b/{relative}\nnew file mode 100644\n'
            patch += ''.join(difflib.unified_diff([], path.read_text(encoding='utf-8').splitlines(keepends=True), fromfile='/dev/null', tofile=f'b/{relative}'))
    if patch:
        (OUT/(folder.name+'.patch')).write_text(patch, encoding='utf-8')
        print(folder.name, 'patch exported')
