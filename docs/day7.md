# SketchyAR — Day 7: Project management and Data Gate

## Starting point
The user confirmed Day 6 on a real iPhone 17. Day 7 builds on v0.6.0 and keeps the Figma Home/Camera layouts and Day 6 autosave unchanged.

## What changed
- Tapping a polaroid opens it as before. The small `···` button in its bottom strip opens a separate project actions dialog.
- Rename updates only `ProjectRecord.title` and `updatedAt`; no image or preset is rewritten. Names must contain 1–100 characters.
- Delete requires a second explicit confirmation; a single IndexedDB `readwrite` transaction removes the project, every historical and active asset, associated presets, and SHA-256 source baselines. If any operation fails, the transaction rolls back.
- `auditProjectDatabase()` is read-only and checks for orphan assets/presets, invalid links and stale SHA-256 keys across all four stores.
- No DB schema version bump. No new JS runtime dependencies or network calls.

## Acceptance on iPhone 17 (G data)
1. Open each saved polaroid; existing stored position and opacity still restore.
2. Create a test project, tap its `···`, rename it, refresh the app and confirm the new name persisted. Original photo and overlay remain intact.
3. Tap `···` → Delete → Cancel. The project must still exist.
4. Tap `···` → Delete → **Изтрий окончателно**. Only the chosen project disappears.
5. Open Diagnostics → **Провери връзките в базата**: `acceptance: PASS`, zero orphan arrays.
6. Create five or more projects; scroll the gallery to the last project. Header/footer remain fixed.
7. Relaunch from Home Screen after force-close and rerun the audit; other project images and presets remain unchanged.
8. Regression: camera, drag/pinch/rotate, Lock SVG swap, slider fill and safe-area layout work.

## Release constraints
No automatic destructive cleanup, no migration, no offline promise, no backup claim. Avoid deleting irreplaceable images before Day 14 backup/restore is implemented. The files in the full-project archive are the Day 6 baseline plus Day 7; use the Git patch to preserve local UI refinements and data.
