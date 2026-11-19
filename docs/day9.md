# SketchyAR · Day 9 — Gaussian, Sobel, XDoG

**Status:** implementation complete on CPython, iPhone Pyodide verification pending.
**Source:** `python_engine/ar_drawing/sketch_engine.py` — single module shared between Windows and iPhone (imported as `?raw` in `python-worker.ts`).
**P0 protected:** Home, Camera, IndexedDB, preset autosave, Gallery and backup plan remain untouched.
**No new dependencies at runtime:** NumPy only; no new CDN, WASM package, AI weights, Service Worker, OpenCV or SciPy.

## Aims and exact algorithm contracts

1. `to_grayscale`: uint8 `[0..255]` or float `[0..1]` => normalized **float32**, H×W; RGB converted with Rec.709 weights. RGBA alpha is ignored explicitly at this stage; this is not yet a transparent overlay export. Non-finite values and invalid dimensions fail rather than silently passing to NumPy.
2. `gaussian_blur`: normalized 1-D Gaussian kernel, radius `ceil(3σ)`, reflected borders; two 1-D passes (horizontal + vertical). Supports σ=0.15…12; output float32. Unlike Day 8's **fixed 5-tap proxy**, this is the actual variable-radius implementation. The Day 8 spike remains unchanged for comparability.
3. `sobel`: Gx, Gy, magnitude, gradient direction in radians (`atan2(Gy,Gx)`), reflect border and /8 normalization. Output float32. This will be reused for NMS on Day 12.
4. `xdog`: extended Difference of Gaussians, `D = Gσ - τG(kσ)`; `white = 1` where `D>=ε`, otherwise `1+tanh(φ(D-ε))`; clipped to `[0,1]` float32. It's an **experimental artistic filter**, not a neural model or intelligent step planner. Four presets (`soft`, `balanced`, `bold`, `detail`) are fixed in Python so Windows/Pyodide use exactly the same values; no claim that they're universally optimal.
5. **Guided V2 invariant preserved:** do **not** overlay masks from different σ to build five drawing steps (the contours may shift/double). On Day 16, one final binary image `F` will be selected and the other scales will only help rank connected segments. `M1⊆M2⊆M3⊆M4⊆M5=F` remains a future contract, not a finished feature.

## Windows commands (repository root)

```powershell
python -m pytest python_engine -q
python scripts/day9_preview.py
python scripts/day9_benchmark.py --sizes 512 1024 --runs 5
```

Optional **local** test with your own photo (not copied to the repo or GitHub):

```powershell
python scripts/day9_preview.py --input "C:\\path\\to\\my-photo.jpg" --max-side 1024
```

Requires `numpy`, `pillow` (only for previews) and `pytest` from `requirements-dev.txt`. The preview generator emits three synthetic fixtures if `--input` is absent, including fictional line-art and simple geometry. It writes a 7-column contact sheet (`comparison.png`) and per-preset PNGs to `experiments/outputs/day9/`. This directory is ignored by Git. Do not commit photos of other people without permission.

The timing script writes `experiments/outputs/day9-cpython-benchmark.json` and `.csv` with **median** kernel timing and deterministic checksums. Warm-up is excluded, as is Pyodide startup, file decoding and transfers. `inputBytes` and `pythonTracemallocPeakBytes` give an initial **CPython-only** memory indication from an untimed run. This trace is *not* process RSS or iOS/WebKit/WASM peak RAM (`peakRamMeasured=false`); `float32` reduces per-element storage but total iPhone RAM is unmeasured.

## iPhone 17 verification

1. Apply patch to verified Day 8.0 project, run `npm ci`, `npm run typecheck`, `npm run build`, Python tests, then push and verify **version 0.9.0 + new commit SHA** in diagnostic UI. Do not clear IndexedDB/reinstall PWA.
2. Open diagnostic screen from the Homepage floppy icon. Press **Ден 9 → Провери Python Sketch Engine**. The existing same-origin Pyodide is initialized (if not already running) and the **exact same source file** from the Python package is loaded lazily into the Worker.
3. The response must show `task=day9_sketch_engine`, `dtype=float32`, `shape=[512,512]`, `runs=3`, and three results `gaussian_sigma_1`, `sobel_magnitude`, `xdog_balanced`. There must be no worker error or unexpected reload.
4. On Windows, run `python scripts/day9_benchmark.py --sizes 512 --runs 3` and compare *checksums* (small floating-point tolerances are expected across NumPy builds). Do not compare timings as if the hardware and runtimes were identical.
5. Open existing saved projects and check thumbnail, rename/delete, camera gestures, mirror, Lock, transparency and autosave. Day 9 does **not** yet apply the XDoG result directly over the live camera — this bridge is scheduled for Day 13.
6. Export diagnostic JSON after testing. Record startup time (if cold), median of all three tasks, checksum, execution mode and whether Camera UI was stable.

### Acceptance criteria

- `pytest` passes; 3 fixtures × 4 presets generate as expected and the output stays within image bounds.
- Same Python module runs on iPhone with *all three* results and no runtime exception.
- Existing Day 7/8 functionality survives; no migration to IndexedDB; no changes to Figma positioning.
- Artifacts: code, `comparison.png`, `day9-cpython-benchmark.json/csv`, exported iPhone diagnostic JSON.

**Potential issues:** the default XDoG may stylize shadows as edges or lose subtle features. Treat these as experiment results, not false claims of AI recognition. For user photos, add optional exposure/contrast preparation in a later iteration after comparative tests.
