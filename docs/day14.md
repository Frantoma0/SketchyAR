# SketchyAR — Day 14 · Backup & Recovery v0.14.0

**Status:** CODE READY / G2 PENDING until tests on the real iPhone. **Baseline:** v0.13.0 (`3cf387f` as supplied by the user). **Scope:** ZIP32 export, independent integrity verification, isolated restore drill, add-only atomic production restore. **Do not clear the Home Screen PWA or its site data.**

## What was implemented

- `app/src/storage/day14-zip.ts`: a small, deliberately restricted, dependency-free ZIP32 **STORE (method 0, no compression)** encoder and strict archive reader. Valid ZIPs (Python `zipfile` interop confirmed). Unsupported ZIP64/DEFLATE/encryption/multi-disk/data descriptor/extra fields/comments are explicitly rejected. This is **not** a general ZIP reader and does not extract files onto a filesystem.
- `app/src/storage/day14-backup-service.ts`: readonly snapshot of the four stores; SHA-256 of **actual Blob bytes**; manifest v1 with provenance/guide; CRC-32 per ZIP entry; strict manifest/path/MIME/id/size/ownership checks; independent read-only ZIP verify; atomic add-only restore. Production restore refuses **all** existing key collisions, including `app_settings`.
- `app/src/day14-diagnostics.ts`: buttons for preparing/saving ZIP, independent `Files` selection/verification, sandbox drill, and optional production restore with confirmation.
- `app/src/main.ts`: Day 14 diagnostic controls only; Camera/Home/gesture logic was not modified.
- `app/tests/day14-zip.test.mjs`: deterministic ZIP/CRC/invalid archive tests (Node >=22).
- Day13 PNG pipeline, IndexedDB version **1**, stores, presets, source selection, camera overlay all unchanged. App version bumped to **0.14.0**.

### Why not fflate today?

The plan's `fflate` candidate could not be installed in the preparation environment because npm registry access was unavailable. Rather than ship a dependency with an unresolved lockfile or untested runtime, we implemented a safe ZIP32-STORE-only path that works for already-compressed photos and PNGs. **Tradeoff:** the archive will be approximately the total byte size of all assets (plus metadata and ZIP headers). The ZIP can be opened by standard ZIP tools; SketchyAR v0.14.0 **only imports its own restricted STORE-format archives**. General-purpose DEFLATE/ZIP64 support would require a separate validated change, not a silent assumption.

## Archive format and limits

| Item | Contract |
|---|---|
| Manifest | `manifest.json`, UTF-8 JSON matching `BackupManifestV1` / `schemaVersion=1` |
| Asset paths | `assets/<lowercase-UUID>.(png\|jpg\|jpeg\|webp\|heic\|heif\|gif\|bin)` |
| Asset digest | SHA-256 over the original Blob byte sequence |
| ZIP integrity | CRC-32 of each member; correct central + local headers, no overlapping entries |
| Total ZIP file size | ≤64 MiB |
| Total asset bytes | ≤60 MiB |
| One asset | ≤24 MiB |
| Manifest size | ≤1 MiB |
| ZIP entries | ≤256 (manifest + up to 255 assets) |
| Restore policy | **Add only**; any ID/key collision causes complete transaction rollback |
| Writes during export/verify | **None** — snapshot/export read existing data only |
| iPhone side effects of sandbox | Uses **only** `sketchyar-day14-restore-sandbox`, deletes it after the drill |

These are product safety caps, not claims about available iPhone RAM. ZIP verification reads the bounded archive into memory, and hashing reads one bounded asset at a time. For archives beyond the caps, future work can add a separately tested streaming design; do not loosen caps without an iPhone memory test.

## Day 14 iPhone acceptance protocol (Home Screen standalone)

1. Install **by normal GitHub Pages update**. **Never uninstall** SketchyAR or clear its IndexedDB. Confirm diagnostics shows `0.14.0` and new commit SHA; capture date, display mode, iOS version.
2. Keep existing projects untouched. Open Home → **floppy diagnostics** → **Day 14**. Run Day13 manifest preflight first. Check counts, orphans via Day7 DB audit. (Any orphan/broken link is a FAIL: fix the data first.)
3. Press **1. Създай ZIP**. Expect `ZIP PREPARED — SAVE TO FILES, THEN VERIFY` with nonzero projects/assets/bytes. The program only prepared the archive — this **is not proof it was saved**.
4. Press **2. Запази ZIP във Files**. Choose **Save to Files** in the native Share Sheet or fallback browser download. Confirm a `.zip` file actually exists in Files. Do not share photos or backups publicly.
5. Press **3. Избери записания ZIP**, select the real file from Files, then **4. Провери SHA-256**. Expect `VERIFY PASS — READ ONLY, NO RESTORE`, archive hash, project/asset counts. This must re-read the saved ZIP, not reuse the in-memory export.
6. Press **5. Тест Restore (безопасен)**. Expect `SANDBOX RESTORE PASS`, with identical project/asset/preset/settings counts and `hashedBytes` equal to the exported total. This test copies into a **separate temporary database**, reads it back, hashes every restored Blob, checks projects/guides/presets/settings, and removes the temporary database. **Real projects are unchanged**.
7. Repeat **Day7 DB audit**, open one original project in Drawing, confirm original source/position/opacity/Lock persist; camera and grid still work. Export diagnostics JSON and record statuses.
8. **Optional actual production restore only on a disposable, collision-free set:** the restore button will refuse a ZIP if its record IDs/keys already exist in production. **Do not delete existing personal projects to make the test succeed.** For a destructive drill, use a disposable test installation/database and a test archive only; the sandbox test already exercises the same transaction writer safely.
9. Negative test on Windows or a disposable installation: flip one byte in a copy of the ZIP and verify rejection **before any DB write**. Attempting to restore the same ZIP twice must fail on an ID conflict without adding records. Validate that an invalid ZIP/unsupported compression produces an understandable error.

### Evidence to return for G2

- Diagnostic JSON (Day14 export, verify, sandbox_restore + Day7 audit); build version + commit SHA.
- Screenshots of `VERIFY PASS` and `SANDBOX RESTORE PASS`, optionally a Files view showing the ZIP.
- Actual project/asset/preset counts and archive SHA-256 (the **ZIP contents need not be shared**, especially if personal images).
- Confirmation that at least one original photo and saved overlay settings remain usable after force-close/relaunch.

**G2 becomes PASS only after real iPhone evidence** of saved-file independent verify, sandbox restore and unchanged production data. Before then: **PENDING**. If it fails, record `G2 FAIL` and begin Day 15 recovery rather than altering historical test results.

## Windows / repository commands

```powershell
# repository root
python -m pytest python_engine -q
cd app
npm ci
npm run typecheck
npm run build
npm run test:day14
```

Node script `test:day14` requires Node 22's experimental TypeScript stripping. `npm ci` must run on a machine with dependency packages available. No extra npm dependency is required for ZIP32 STORE.

## Risks / future enhancements

- Standard ZIP archives using DEFLATE cannot be imported here. Use a backup exported directly by SketchyAR v0.14.0.
- The archive is **unencrypted**. Store it privately (it contains original photos). Do not send to a public repo or log images.
- `app_settings` are archived and preserved. Production restore requires unused keys; this intentionally errs toward no data loss rather than trying to overwrite settings.
- Native iOS share/download can be canceled; a Share Sheet close is **not** a proven backup. Repeat the independent file-picker verification.
- The tests in the development container cannot replace Home Screen iPhone testing. Performance, quota, persistence and actual filesystem handoff require device evidence.
- Existing automatic photo-processing and guide data are included in the manifest; no generated new graphical output, Guided Drawing or AI is added on Day 14.

### Optional independent verifier on Windows

After downloading a ZIP created by the app, run:

```powershell
python scripts/day14_verify_zip.py "C:\path\SketchyAR-backup-YYYY-MM-DD.zip"
```

The script uses Python's standard-library `zipfile` + `hashlib` and reports `INDEPENDENT ZIP SHA-256 PASS`; it neither extracts nor imports records. Do not upload personal-image backups to a public repository or chat just to obtain this independent digest check.
