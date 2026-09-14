"""Validate module-source-map.json without network access."""
from __future__ import annotations

import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE_MAP = json.loads((ROOT / "inventory" / "module-source-map.json").read_text(encoding="utf-8"))
SOURCE_LOCK = json.loads((ROOT / "inventory" / "sources-lock.json").read_text(encoding="utf-8"))
LOCK_BY_REPO = {item["url"].removesuffix(".git").removeprefix("https://github.com/"): item for item in SOURCE_LOCK}

errors: list[str] = []
for module_id, module in SOURCE_MAP.get("modules", {}).items():
    donors = []
    if isinstance(module.get("primary"), dict):
        donors.append(module["primary"])
    donors.extend(d for d in module.get("alternates", []) if isinstance(d, dict))
    for donor in donors:
        repo = donor.get("repository")
        status = str(donor.get("status", ""))
        license_name = str(donor.get("license", ""))
        if not repo:
            errors.append(f"{module_id}: donor has no repository")
            continue
        if "approved" in status or "feature_donor" in status:
            if license_name in {"", "review_required"}:
                errors.append(f"{module_id}: reusable donor {repo} has no approved license")
            if not donor.get("commit"):
                errors.append(f"{module_id}: reusable donor {repo} is not pinned")
        locked = LOCK_BY_REPO.get(repo)
        if locked and donor.get("commit") and locked.get("commit") != donor["commit"]:
            errors.append(f"{module_id}: {repo} commit does not match sources-lock.json")

if errors:
    raise SystemExit("Source-map validation failed:\n- " + "\n- ".join(errors))

print(f"Validated reuse policy for {len(SOURCE_MAP.get('modules', {}))} module groups.")
