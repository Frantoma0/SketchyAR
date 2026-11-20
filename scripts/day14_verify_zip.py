"""Independent Windows-side digest verification of a SketchyAR v0.14 ZIP backup.

Usage: python scripts/day14_verify_zip.py "C:/path/SketchyAR-backup-2026-11-20.zip"
Does NOT restore or extract any user file. This corroborates the JS integrity check,
not a replacement for the device's IndexedDB / UI G2 acceptance.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

LIMIT_ARCHIVE = 64 * 1024 * 1024
LIMIT_ASSET = 24 * 1024 * 1024
LIMIT_TOTAL = 60 * 1024 * 1024
LIMIT_MANIFEST = 1024 * 1024
PATH_RE = re.compile(r"assets/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(?:png|jpg|jpeg|webp|heic|heif|gif|bin)\Z")
SHA_RE = re.compile(r"[0-9a-f]{64}\Z")


def verify(path: Path) -> dict[str, object]:
    if not 22 <= path.stat().st_size <= LIMIT_ARCHIVE:
        raise ValueError("Invalid ZIP archive size")
    with zipfile.ZipFile(path, "r", allowZip64=False) as z:
        info = z.infolist()
        names = [x.filename for x in info]
        if not 1 <= len(info) <= 256 or len(set(names)) != len(info):
            raise ValueError("Invalid number of members or duplicated filename")
        if "manifest.json" not in names or any(
            n != "manifest.json" and not PATH_RE.fullmatch(n) for n in names
        ):
            raise ValueError("Unrecognized or dangerous ZIP entry name")
        if any(x.compress_type != zipfile.ZIP_STORED or x.flag_bits & 1 or x.is_dir() for x in info):
            raise ValueError("Only unencrypted, stored ZIP members are accepted")
        total = sum(x.file_size for x in info if x.filename != "manifest.json")
        if total > LIMIT_TOTAL or any(x.file_size > (LIMIT_MANIFEST if x.filename == "manifest.json" else LIMIT_ASSET) for x in info):
            raise ValueError("Oversized entry or uncompressed total")
        manifest = json.loads(z.read("manifest.json", pwd=None))
        if manifest.get("format") != "sketchyar-backup" or manifest.get("schemaVersion") != 1 or manifest.get("integrity", {}).get("algorithm") != "SHA-256":
            raise ValueError("Invalid manifest format/schema/integrity")
        assets = manifest.get("assets")
        if not isinstance(assets, list) or len(assets) + 1 != len(info):
            raise ValueError("Missing/unexpected asset entries")
        expected = {a["path"]: a for a in assets}
        if len(expected) != len(assets) or set(expected) != set(names) - {"manifest.json"}:
            raise ValueError("Missing/duplicate/unknown manifest assets")
        for name, asset in expected.items():
            if not SHA_RE.fullmatch(asset.get("sha256", "")) or asset.get("byteSize") != z.getinfo(name).file_size:
                raise ValueError(f"Manifest size/hash invalid: {name}")
            with z.open(name) as stream:
                digest = hashlib.sha256()
                while chunk := stream.read(1024 * 1024):
                    digest.update(chunk)
            if digest.hexdigest() != asset["sha256"]:
                raise ValueError(f"SHA-256 mismatch: {name}")
        return {"status": "INDEPENDENT ZIP SHA-256 PASS", "file": path.name,
                "archiveBytes": path.stat().st_size,
                "archiveSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "projects": len(manifest.get("projects", [])), "assets": len(assets),
                "presets": len(manifest.get("presets", [])), "settings": len(manifest.get("settings", [])),
                "assetBytes": total}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("zip_file", type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.zip_file), ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError, zipfile.BadZipFile) as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
