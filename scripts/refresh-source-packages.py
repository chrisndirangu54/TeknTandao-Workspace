"""Resolve the modern donor apps using the installed Flutter tool."""
import concurrent.futures
import pathlib
import shutil
import subprocess
ROOT = pathlib.Path(__file__).resolve().parents[1]
BIN = pathlib.Path(shutil.which('flutter')).parent
OUT = ROOT/'inventory/source-diagnostics'
OUT.mkdir(parents=True, exist_ok=True)
def refresh(folder):
    result = subprocess.run([str(BIN/'cache/dart-sdk/bin/dart.exe'), str(BIN/'cache/flutter_tools.snapshot'), 'pub', 'get'], cwd=folder, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=240)
    (OUT/(folder.name+'.pub.log')).write_text(result.stdout+result.stderr, encoding='utf-8')
    print(folder.name, result.returncode, (result.stdout+result.stderr)[-1200:] if result.returncode else 'resolved', flush=True)
if __name__ == '__main__':
    folders = [p for p in (ROOT/'sources').iterdir() if (p/'pubspec.yaml').exists() and p.name not in ['Hospital-Management-System-Mobile-App','TallyAssist']]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(refresh, folders))
