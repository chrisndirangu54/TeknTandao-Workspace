"""Clone or refresh pinned, approved module donor repositories without executing them.

Usage:
  python scripts/sync-module-sources.py
  python scripts/sync-module-sources.py crm pos time

This script intentionally does not run package managers, build steps, migrations or
upstream scripts. It only obtains source at pinned commits for inspection/migration.
"""
from __future__ import annotations

import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
MAP = ROOT / "inventory" / "module-source-map.json"
SOURCES = ROOT / "sources"


def run(*args: str, cwd: pathlib.Path | None = None) -> str:
    return subprocess.check_output(args, cwd=cwd, text=True).strip()


def donor_entries(module: dict) -> list[dict]:
    entries: list[dict] = []
    primary = module.get("primary")
    if isinstance(primary, dict):
        entries.append(primary)
    for item in module.get("alternates", []):
        if isinstance(item, dict):
            entries.append(item)
    return entries


def eligible(donor: dict) -> bool:
    status = str(donor.get("status", ""))
    license_name = str(donor.get("license", ""))
    return (
        donor.get("repository")
        and donor.get("commit")
        and "audit_only" not in status
        and "review_required" not in license_name
    )


def sync(repo: str, commit: str) -> None:
    name = repo.rsplit("/", 1)[-1]
    destination = SOURCES / name
    url = f"https://github.com/{repo}.git"
    if not destination.exists():
        subprocess.check_call(["git", "clone", "--filter=blob:none", "--no-checkout", url, str(destination)])
    else:
        origin = run("git", "remote", "get-url", "origin", cwd=destination)
        if origin.removesuffix(".git") != url.removesuffix(".git"):
            raise RuntimeError(f"Refusing to reuse {destination}: origin mismatch ({origin})")
    subprocess.check_call(["git", "fetch", "--depth", "1", "origin", commit], cwd=destination)
    subprocess.check_call(["git", "checkout", "--detach", commit], cwd=destination)
    print(f"synced {repo}@{commit}")


def main() -> None:
    config = json.loads(MAP.read_text(encoding="utf-8"))
    requested = set(sys.argv[1:])
    modules = config["modules"]
    unknown = requested.difference(modules)
    if unknown:
        raise SystemExit(f"Unknown module(s): {', '.join(sorted(unknown))}")

    SOURCES.mkdir(exist_ok=True)
    selected = requested or set(modules)
    count = 0
    for module_id in sorted(selected):
        for donor in donor_entries(modules[module_id]):
            if not eligible(donor):
                continue
            sync(donor["repository"], donor["commit"])
            count += 1
    print(f"Synced {count} licensed/pinned donor repositories. No upstream code was executed.")


if __name__ == "__main__":
    main()
