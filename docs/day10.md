# SketchyAR Day 10 — Tonal simplification and controlled edge comparisons

**Build:** `v0.10.0` on top of **verified Day 9 v0.9.0**. **Acceptance:** desktop implementation checked; iPhone Pyodide validation still required. No changes to the Home/Camera UI, IndexedDB, autosave, gallery, lock, CSS or offline caching.

## Purpose and architectural decisions

Day 10 adds an *independent, testable Python-only* module `python_engine/ar_drawing/day10_tones.py`. Runtime dependencies: **NumPy only**, reusing the unchanged Day 9 Gaussian/Sobel/XDoG implementation.

| Operator | Inputs | Output | Intended use / limit |
|---|---|---|---|
| `tone_quantize(image, levels)` | normalized grayscale or RGB, levels **3, 4, 5** | `float32` array in `[0,1]`; up to N uniformly spaced tones | Construction of broad light/dark regions; a fixed palette, not AI segmentation |
| `tone_preview(...)` | as above | `uint8` grayscale | Local PNG preview on Windows |
| `sobel_ink(image, sigma=1, threshold=0.08)` | grayscale/RGB | bool binary mask (`True` means ink) | Sobel after Gaussian; absolute threshold in normalized gradient units; **not** Canny/NMS |
| `sobel_ink_preview(...)` | as above | white paper/black edges, uint8 | Quick contour comparison; double edges may occur |
| `tone_and_ink(image, levels=4, preset='balanced')` | as above | float32 grayscale, tones multiplied by XDoG | Experimental combination, **not** Guided Drawing steps |
| `benchmark_day10(size, runs, seed)` | seeded random float32 | JSON with timings, checksum, dtype and metadata | Same workload in CPython and Pyodide |

**Important:** 3, 4 and 5 tonal levels refer to **tonal colors**, not 3–5 drawing stages. Guided Drawing V2 is still planned as **exactly 5 nested masks** `M1⊆…⊆M5=F` obtained from one fixed final contour map; we do **not** combine masks from different Gaussian scales. For that later algorithm, score **whole line segments**, not arbitrary per-pixel thresholds, to reduce broken strokes.

**Color and transparency:** Rec.709 luminance weights, `float32`; RGBA alpha is currently ignored by the shared Day 9 normalization. There is **no** alpha PNG, automatic guide generation, semantic understanding, or real-image processing in the Drawing UI yet. These belong to later stages (mainly Days 13–16).

## Windows commands (repository root)

```powershell
python -m pytest python_engine -q
python scripts/day10_preview.py
python scripts/day10_benchmark.py --sizes 512 1024 --runs 5
python scripts/day10_compare_cv2.py    # OPTIONAL Windows OpenCV reference only
```

Previews: `experiments/outputs/day10/comparison.png`, per-operator PNGs and `comparison.json`. Desktop benchmark: `experiments/outputs/day10-cpython-benchmark.json` and `.csv`. Every file in `experiments/outputs/` is ignored by Git. To process one personal image entirely on your computer:

```powershell
python scripts/day10_preview.py --input "C:\path\to\my-photo.jpg" --max-side 1024
```

The built-in synthetic geometry, fictional face and shaded-object test images are also used for the sample comparison sheet. Don't push personal photos or diagnostic JSON containing personally identifiable data to public GitHub.

### Reference comparison

- `test_sobel_reference_direct_2d_convolution`: independent 3×3 NumPy reference implementation to check the mathematical Sobel kernel and reflect border behavior.
- `scripts/day10_compare_cv2.py` (optional on Windows): checks Gx/Gy/magnitude versus `cv2.Sobel`, `ksize=3`, `scale=1/8`, `BORDER_REFLECT_101`, float32, tolerance 1e-6. **OpenCV is not needed on iPhone**.
- Tests also cover boundaries, dtypes, unchanged inputs, strict level count, binary ink, deterministic checksums and invalid arguments.
- Visual quality and human readability are **not** implied by checksum equality. Tone quantization may make textured backgrounds blocky; Sobel may double contours; XDoG is a stylization filter.

## iPhone verification

1. Apply patch, run `npm ci`, `npm run typecheck`, `npm run build`,  Python tests and push to GitHub. Confirm new `0.10.0` version and commit SHA, **without reinstalling the PWA or deleting IndexedDB**.
2. From Home Screen, open the diagnostic UI. Run **Day 10 / 512 px** followed by **Day 10 / 1024 px**. These execute in the same Pyodide Web Worker as Day 9; Day 9's module loads lazily once. No new Pyodide wheels.
3. Expected: `task='day10_tones_and_ink'`, `pipelineVersion='day10-raster-v1'`, `dtype='float32'`, `runs=3`, `seed=173`, 4 benchmark rows per size (tone3, tone5, Sobel ink, 4 tones + XDoG). No uncaught errors or page reloads.
4. Export the diagnostic JSON and compare the output checksums with Windows (prefer Windows `--runs 3` for equivalent sample count, though checksum itself is independent of runs):

```powershell
python scripts/day10_compare_device.py `
  experiments/outputs/day10-cpython-benchmark.json `
  "C:\path\to\sketchyar-diagnostics.json"
```

5. Verify Home, gallery of 5+ projects, rename/delete, Camera, drag/pinch/rotate, mirror, Lock, opacity, grid and autosave/restore. Run a 1024 px test while the app is in use only if the UI supports that; **this diagnostic test itself does not assert camera FPS**.

## Acceptance and scope

- [ ] Windows `npm ci && npm run typecheck && npm run build` pass (must be verified on your PC; this environment lacks the pinned npm/Vite binary).
- [x] Python tests pass; deterministic preview sheet generated; optional reference Sobel/OpenCV comparison passed on local PC environment.
- [ ] iPhone Day 10 512 & 1024 both succeed with four benchmark results and no reload.
- [ ] Cross-platform checksums match within numerical tolerances (`day10_compare_device.py`).
- [ ] Previous UI and IndexedDB functions remain intact.

**No Service Worker or guaranteed offline launch in Day 10.** The current Python packages are self-hosted by Day 8, but Day 18–19 must still verify complete offline caching and integrity.
