# SketchyAR — Ден 13 (v0.13.0): Реална снимка → Pyodide → прозрачен PNG

**Основата е завършеният Day 12 v0.12.0.** Тази версия добавя реален бинарен image bridge и подготвя manifest v1 за backup. Няма промени по Drawing, Home, CSS, камерата, safe areas, съществуващите presets или `/sw-spike/`. Новата функция е **само в диагностичния екран**, докато не мине реалните тестове на iPhone.

## A. Протокол на данните

```text
IndexedDB: projects.activeAssetId → assets[role='source'] (оригинален Blob)
  ↓ HTMLImageElement.decode() + Canvas2D drawImage (EXIF ориентация: browser-dependent)
  ↓ downscale до max(width,height) ≤ 1024; бяла подложка за alpha
  ↓ grayscale BT.709 / 8-bit / H×W Uint8Array (≤1 MiB)
  ↓ structured clone / transferable ArrayBuffer (JS → module Web Worker)
  ↓ Pyodide JsProxy.to_py() → Python memoryview
  ↓ process_gray8() → uint8→float32 [0,1] → Day 12 canny_like()
  ↓ bool F → bytes 0/1 → PyProxy.toJs() → Uint8Array → transferable (Worker → UI)
  ↓ Canvas ImageData: black RGB, alpha=255 if F pixel, otherwise alpha=0
  ↓ Canvas.toBlob('image/png') → separate processed AssetRecord in IndexedDB
  ↓ optional PNG export via download button
```

**Input contract:** nonempty `width × height` gray8 bytes, 3–1024 per dimension, ≤1,048,576 pixels, fixed parameters `sigma=1.0`, `low=0.04`, `high=0.10` (absolute Sobel magnitude). **Output:** 0/1 binary F, not antialiased or artistically optimized. `True`/1 becomes an opaque black pixel; white space is genuinely transparent. Retains image aspect ratio. Python and browser do not send any pixels to a remote server; the Pyodide runtime is same-origin from Day 8, but true offline remains Day 19.

**No accidental replacement:** Project `activeAssetId` stays the same source. The new processed asset has `role='processed'`, `sourceAssetId`, `params`, `pipelineVersion`, `modelId='none'`, `backend='numpy-pyodide'`, `byteSize`, `mimeType='image/png'`, dimensions. Active source ID is checked during the **same IndexedDB transaction** that writes the derivative. A new photo or deleted project invalidates the write. Requests have unique IDs; changing selection invalidates results before display. Even a successful old request cannot change the current camera overlay.

**Limitations:** initial `<img>.decode()` can temporarily decode a high-resolution original before resizing; tests with 48 MP and >8 MB sources are still needed. `Image.decode()` browser EXIF support must be checked on the target iPhone. The new PNG is a **thin edge map**, not guaranteed visually usable for portraits/animals. A weak F cannot be repaired by Guided Step Planner. Large binary arrays are not included in exported logs, only counts/timings/IDs. Repeated clicks can create multiple derivative assets; cleanup and regeneration policy come later.

## B. Windows tests

From repository root:

```powershell
python -m pytest python_engine -q
python scripts/day13_benchmark.py --sizes 512 1024 --runs 5
cd app
npm ci
npm run typecheck
npm run build
cd ..
```

The CPython benchmark excludes image decode/Canvas, browser transfer, PNG encoding, Web Worker startup and IndexedDB. Do not compare its total blindly with JS `workerRequestMs` (which includes overhead).

## C. iPhone acceptance tests (Home Screen PWA)

1. Verify build **0.13.0** and new SHA. Do NOT uninstall or clear site data.
2. From diagnostics → Day 13, select one **test project**, press **Генерирай и запази PNG**. Check `PASS`, `requestId`, `sourceAssetId`, `processedAssetId`, `inkPixels`, `pngBytes`, `processingMs`, `workerRequestMs`.
3. Verify preview has genuinely transparent background (checkerboard), no white rectangular sheet. Export/share PNG and inspect in Photos/Files if the OS permits.
4. Open the same project from gallery: **original photo must still be active**, same opacity/scale/Lock as before.
5. Re-run with portrait, landscape and rotated EXIF source; keep aspect ratio and orientation. Use a test photo >8MB only if sufficient memory; ensure no unexpected restart.
6. Rapidly switch selected project during processing and trigger new request; **an older result must not replace a newer one**. If the app refuses concurrent operations, that is acceptable as long as stale output cannot overwrite the project.
7. Run 10 sequential processing requests on 512–1024px inputs, observing `workerRequestMs`, JavaScript responsiveness and stability; export diagnostics JSON.
8. Press **Провери manifest v1**. Expect `MANIFEST V1 READY — NO BACKUP CREATED`; verify project, asset and relation counts. No ZIP generated yet.
9. Regression: camera on/off, 3×3 grid, Lock, transparency, gesture, home safe area, gallery scroll, autosave/restore, rename and delete a *test* project. Validate no orphan assets.

**Do not interpret this as G2 pass:** verified ZIP export/restore, digest verification, rollback on corruption and fresh-install restore are **Day 14**. The preflight only checks manifest relationship inputs.

## D. Academic and quality notes

- The published npm app is not modified to start Pyodide at launch; Python runs on demand.
- All Day 9–12 algorithms remain their original reference baselines. Python bridge tests verify the *same* F as `canny_like()` for identical gray8 pixels, and check buffers, limits and no mutation.
- This day demonstrates structured transfer, CPU/worker separation, image provenance and deterministic NumPy processing. End-to-end performance should be collected on the iPhone separately from pure Python microbenchmarks.
- `projects[].guide` and `assets.role='guide-step'` remain reserved in the backup v1 schema; the five-step raster planner is **not** implemented yet.
- Future photo preset must be evaluated on at least portrait, animal and object photography; default thresholds can lose important silhouette lines. Keep `F` as the single final geometry and plan steps as subsets later.

## E. Decision gate

Day 13 may be accepted **only after** a real iPhone processed-asset SAVE, an alpha PNG review, stale-result test, 10 sequential operations, correct original-asset restore and backup manifest preflight, plus regression. This is not Day 14's ZIP backup gate.
