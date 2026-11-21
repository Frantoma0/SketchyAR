# SketchyAR — Day 28 / v0.28.0: Sketch V4 (Flow-Coherent Hybrid)

**Status:** code integrated; 150/150 Node and 227/227 CPython regression tests PASS locally; TypeScript 5.8 typecheck PASS. **Windows TypeScript 7/Vite production build and real iPhone Safari/Pyodide test PENDING.**

## Goal and compatibility

The **Скица** button now starts **only V4** (`python_engine/ar_drawing/day28_flow_coherent.py`) through the existing Worker command `day13-process`. V1 (Day12/13), Day25, V2 (Day26), V3 (Day27) are kept as inactive comparison modules and are not imported into the production Worker. This is the Day27 branch upgraded **without touching** graphite SVGs, UI placement, Home, Camera, project schema, backup/restore, or the rule that only **Рисувай** applies a draft to Home and Camera.

Previously *applied* V1–V3 PNG assets remain intact. Opening a project can still show the previously applied asset; to explicitly generate V4, unselect and reselect `Скица` in the editor, wait for the new V4 draft, then choose `Рисувай` to apply it. A newly generated draft may be saved for reuse without becoming the applied asset until Draw.

## Implementation (NumPy-only, no OpenCV or trained model)

1. Edge-preserving **3×3 self-guided grayscale smoothing** with a soft global levels mix. No actual skin/portrait detection; avoids local CLAHE exaggeration.
2. Three Gaussian/Sobel scales (0.75, 1.55, 3.05) and cross-scale persistence estimate, followed by one thin NMS map.
3. **ETF-lite:** orientation smoothing with double-angle vectors so opposite tangents do not cancel; coherence confidence is downweighted in heavily textured regions. This is a *local approximation*, not a full curved streamline ETF integrator.
4. **FDoG-lite:** local normal-contrast/ridge evidence and five tangent-guided spatial samples, vectorized over pixels with NumPy `int32` index arrays. This is an FDoG-*inspired* filter, **not** exact canonical FDoG.
5. Per-pixel confidence-weighted fusion, second NMS and guarded survival of important short/angled details, then adaptive hysteresis and sparse isolated speck cleanup.
6. The existing Day13 bridge converts a binary 0/1 mask to a **black transparent PNG** (unchanged encoder).

The generated map stores only a **single float32 H×W score** plus SHA-256 of the source gray8 bytes, width, height and sigma. On new input, the previous cache is evicted; settings `low` and `high` rerun selection without recomputing flow. The UI **detail 1–5 and line thickness still do not affect PNG**, and no speed target is promised for those controls before wiring them.

Ablation entry points: `flow_importance(...,stage='baseline'|'preprocess'|'flow'|'fusion')`; the production calls `fusion` only. Preview has a different version (`day28-flow-coherent-v4`) so old V3 previews are not silently interpreted as V4.

## CPython laboratory A/B results (private test set)

- **30/30** JPEG/PNG/HEIC entries processed successfully at **max-side 384 px**. The 9 HEIC files were decoded **locally using heif-convert**, NOT via iPhone Safari.
- Median ink-pixel coverage: **V3 5.214% → V4 6.454%**; V4 is denser on **29/30** images. **This is a change in line selection, not a proven quality improvement**. V4 can still introduce parallel/doubled lines and background texture.
- Median CPython wall time per image (includes edge mask creation, excludes JPEG/HEIC decode): **V3 23.21 ms → V4 38.59 ms** at max 384 px. No inference from these timings to iPhone/Pyodide (runtime, photo decode and PNG encode differ).
- Test portrait `img-18`: **V3 5.204% → V4 5.480%**. Main features appear in local contact-sheet inspection, but aesthetic quality needs a human rating and more portraits.
- CSV `docs/day28-anonymized-metrics.csv` contains **only** anonymized IDs, source formats, dimensions and numerical measurements. No original photos, names, hashes or private contact sheets are in the Git patch ZIP.
- Local A/B contact sheet (PRIVATE, outside patch): `SketchyAR_Day28_Private_V3_V4_Comparison.jpg`.

The benchmark intentionally does **not** calculate a fake portrait-quality percentage. A larger test set with different real faces, backgrounds and lighting is necessary before claiming V4 is better than V3.

## Acceptance checklist — Windows and iPhone

1. `cd app && npm ci --include=dev && npm run typecheck && npm run build && npm run test:day28`
2. `cd .. && python -m pytest python_engine -q`
3. Inspect staged paths with `git status`, `git diff --cached --stat`, `git diff --cached --check`; commit only source/tests/docs, no originals.
4. Deploy, verify **v0.28.0** and new commit in diagnostics; clear outdated PWA tabs if the service worker keeps old code.
5. On a **new portrait project**, tap **Скица**. Ensure a real contour PNG appears and that V4 runs without a timeout or memory error.
6. Compare real portrait **eyes, nose, mouth, jaw, hair and background** with V3. Also try cat/animal, logo, illustration and a complicated textured photo. Photograph problematic results.
7. Exit without **Рисувай**: Home and Camera **must not change**. Tap **Рисувай**: both should display the *same* newly selected V4 PNG.
8. Force-close/reopen: applied PNG, selected style, camera transform/opacity and original assets must remain intact.
9. Verify DB audit, ZIP Backup/Verify and one HEIC import on **iPhone**, separate from the laboratory HEIC conversion.
10. Repeat with an old V3 project: no automatic overwrite; unselect/reselect Sketch to regenerate V4, apply only with Draw.

## Scientific and engineering limitations

The algorithm uses classical image gradients and **does not semantically understand human faces**. Extra edges are not automatically better. Real iPhone memory, loading, cached-preview logic and performance remain **PENDING**. We retain historical V1–V3 modules for reproducible A/B and rollback; the inactive modules are not bundled into the active Worker beyond baseline Day9/Day12/Day13 dependencies.

## Reference ideas (not copied source)

- [Sketch Generation with Drawing Process Guided by Vector Flow and Grayscale (AAAI 2021)](https://github.com/TZYSJTU/Sketch-Generation-with-Drawing-Process-Guided-by-Vector-Flow-and-Grayscale) — Edge Tangent Flow/drawing-direction inspiration.
- [Coherent Line Drawing](https://github.com/SSARCandy/Coherent-Line-Drawing) and [colidr](https://github.com/esimov/colidr) — ETF + FDoG design inspiration.
- [contour-extractor](https://github.com/LyreZ61/contour-extractor) — foreground-silhouette vs internal-contour architectural separation as a *future* option.

All V4 source code is self-contained NumPy and written for this project. No third-party weights or copied vendor source was added.
