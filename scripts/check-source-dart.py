"""Analyze independent Flutter donor projects and retain actionable diagnostics."""
import concurrent.futures
import json
import pathlib
import shutil
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'inventory' / 'source-diagnostics'
OUTPUT.mkdir(parents=True, exist_ok=True)
DART_WRAPPER = pathlib.Path(shutil.which('dart'))
DART = str(DART_WRAPPER.parent / 'cache/dart-sdk/bin/dart.exe') if DART_WRAPPER.suffix == '.bat' else str(DART_WRAPPER)

def analyze(folder):
    legacy = ROOT / '.toolchains/flutter-2.10.5/bin/cache/dart-sdk/bin/dart.exe'
    executable = str(legacy) if folder.name in ['TallyAssist', 'Hospital-Management-System-Mobile-App'] and legacy.exists() else DART
    result = subprocess.run([executable, 'analyze', '--format', 'machine'], cwd=folder,
                            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=240)
    diagnostics = result.stdout + result.stderr
    (OUTPUT / (folder.name + '.log')).write_text(diagnostics, encoding='utf-8')
    counts = {severity: sum(line.startswith(severity + '|') for line in diagnostics.splitlines())
              for severity in ['ERROR', 'WARNING', 'INFO']}
    row = {'source': folder.name, 'exitCode': result.returncode, 'sdk': 'legacy' if executable != DART else 'current', **counts}
    print(json.dumps(row), flush=True)
    return row

if __name__ == '__main__':
    folders = [p for p in (ROOT / 'sources').iterdir() if (p / 'pubspec.yaml').exists()]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(analyze, folders))
    (OUTPUT / 'summary.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
