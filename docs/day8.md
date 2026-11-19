# SketchyAR Day 8 — self-hosting & Python baseline

**Scope:** Remove runtime network dependence on Google Fonts and jsDelivr. Keep the complete Day 7 project CRUD/Camera/UI intact. This is **not** Day 19 `CORE OFFLINE READY`: no SW caching or offline first launch is claimed.

## Exact inputs and sources

- Pyodide **314.0.8**, official **full** distribution (core loader, runtime, stdlib and lockfile) from its version-pinned static release URL.
- NumPy and its `pyodide-lock.json` dependencies from that same release; wheel `sha256` is checked against the lockfile.
- Caveat Bold source pinned to the Google Fonts upstream `googlefonts/caveat` commit `59745e818ef7973e11e70cb1358d0e902b56c5fc`, converted losslessly as a font container to WOFF2 with fontTools. The Bulgarian Cyrillic glyphs are preserved, no stripping/subsetting.
- Local `public/licenses/Caveat-OFL.txt` is downloaded and deployed with the app. Font binary is generated during build and is not included in the source patch.

## Windows / PowerShell setup (from repository root)

```powershell
python -m pip install "fonttools[woff]==4.63.0"
python scripts/vendor_day8.py
python scripts/vendor_day8.py --check

cd app
npm ci
npm run typecheck
npm run build
cd ..

python scripts/day8_benchmark.py --sizes 512 1024 --runs 5
python -m pytest python_engine -q
```

If you need the legacy optional OpenCV comparison, execute `python scripts/vendor_day8.py --with-opencv` (and rebuild). The default NumPy-only build **does not** load `opencv-python` or fetch it from the internet. After assets are downloaded once, `--check` and local rebuilds need no connection (npm ci must have its own cached deps). `scripts/vendor_day8.py` always needs network on first run.

### Deployment

GitHub Actions `pages.yml` now runs the exact same vendor command before `npm run build`, verifies file hashes, and caches prepared artifacts to avoid repeated downloads. Deployment fails explicitly if any required Pyodide asset or font cannot be prepared. **Do not commit** `.woff2` or generated `app/public/pyodide/` resources; only source, script, lockfile, and docs belong in the patch.

### iPhone 17 acceptance

1. Push the new build and verify the build SHA. Homepage labels must still use Caveat Bold at the exact previously fixed positions.
2. Open the diagnostic screen (floppy icon) and run **Ден 8 — Локални зависимости → Провери self-hosted ресурси**. Expected: `sameOrigin: true`, `missingFiles: []`, `caveatLoaded: true`, `status: FILES PRESENT`.
3. Run **1. Локален Pyodide**, then **NumPy** five times or run the NumPy benchmark. `pyodideBasePath` should end in `/SketchyAR/pyodide/v314.0.8/`. Confirm progress/logs give `loader`, `python-runtime`, `numpy` and median timing.
4. With Safari / Eruda Network open, confirm **no requests** to `fonts.googleapis.com`, `fonts.gstatic.com` or `cdn.jsdelivr.net` during startup or Python use. All Pyodide `.wasm`/`.whl` and font loads must be from `frantoma0.github.io`.
5. Perform a regression: camera, slider, drag/pinch/rotate, Lock, save/restore settings, rename/delete and scrolling gallery all behave as Day 7.
6. Export JSON diagnostics. Record `cold start`, cached start, NumPy median (1024² float32), total vendored bytes and iPhone display mode. Do not compare iPhone timings to CPython Windows timings as if the environments were equivalent.
7. **Do not use airplane mode as a passing Day 8 test**; Service Worker staged precache and SHA-256 Offline Ready validation are Days 18–19.

### Fallback / recovery

- If build fails because the WOFF2 cannot be loaded, run the vendor script again and verify that `app/src/fonts/Caveat-Bold.woff2` begins with `wOF2`.
- If Pyodide's `numpy` cannot load, run `python scripts/vendor_day8.py --check` to validate every asset SHA. The browser's Day 8 check only verifies presence, not full hashes.
- If a dynamic import resolves to `/assets/pyodide/` instead of `/SketchyAR/pyodide/`, inspect the worker's `PYODIDE_BASE`; it derives from the parent of the worker URL.
- If OpenCV is absent, that is expected in the default build; it does **not** block G2 or offline Python core.

### What comes next

**Day 9:** float32 separable Gaussian and a first XDoG comparison; keep the current spike benchmark as a repeatable performance baseline. No AI model or Service Worker introduced today.
