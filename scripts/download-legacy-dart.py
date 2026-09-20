"""Fetch the pinned legacy Dart SDK from Flutter's official archive in ranges."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import urllib.request
import zipfile
ROOT = Path(__file__).resolve().parents[1]
SDK = ROOT/'.toolchains/flutter-2.10.5'
engine = (SDK/'bin/internal/engine.version').read_text().strip()
url = f'https://storage.googleapis.com/flutter_infra_release/flutter/{engine}/dart-sdk-windows-x64.zip'
with urllib.request.urlopen(urllib.request.Request(url, method='HEAD'), timeout=30) as response:
    total = int(response.headers['Content-Length'])
parts = ROOT/'.toolchains/legacy-sdk-parts'
parts.mkdir(exist_ok=True)
chunk = 2 * 1024 * 1024
def fetch(index):
    start, end = index * chunk, min((index + 1) * chunk, total) - 1
    path = parts/f'{index:04}.part'
    if path.exists() and path.stat().st_size == end-start+1: return path
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={'Range':f'bytes={start}-{end}'})
            with urllib.request.urlopen(request, timeout=90) as response:
                if response.status != 206: raise RuntimeError('Server did not honor range')
                body = response.read()
            if len(body) != end-start+1: raise RuntimeError('Truncated range')
            path.write_bytes(body)
            print(f'Downloaded part {index+1}/{(total+chunk-1)//chunk}', flush=True)
            return path
        except Exception:
            if attempt == 2: raise
with ThreadPoolExecutor(max_workers=16) as pool:
    downloaded = list(pool.map(fetch, range((total+chunk-1)//chunk)))
archive = ROOT/'.toolchains/legacy-dart-complete.zip'
with archive.open('wb') as output:
    for part in downloaded: output.write(part.read_bytes())
target = (SDK/'bin/cache').resolve()
with zipfile.ZipFile(archive) as zipped:
    if zipped.testzip() is not None: raise RuntimeError('SDK archive CRC failed')
    for name in zipped.namelist():
        if not (target/name).resolve().is_relative_to(target): raise RuntimeError('Unsafe archive path')
    zipped.extractall(target)
(target/'engine-dart-sdk.stamp').write_text(engine)
print('Legacy Dart SDK installed and archive integrity verified.', flush=True)
