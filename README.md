# SketchyAR — Offline-First AR Drawing Assistant

**SketchyAR** is a zero-backend, offline-first Progressive Web App (PWA) built with TypeScript and Vite, designed for iPhone (iOS 26+)[cite: 1, 2, 3]. It turns your device into a physical tracing assistant by projecting a customizable, semi-transparent reference overlay over a live camera feed[cite: 3, 5].

No App Store, no user accounts, and no cloud dependencies—all image processing and project storage run 100% locally on your device[cite: 1, 2].

## ✨ Features

* **Fixed Camera Overlay:** Smooth, CSS-accelerated image overlay (`0–100%` opacity in `1%` steps) with multi-touch gestures (drag, pinch-to-zoom, rotate, mirror), an optional coordinate grid, and position locking[cite: 2, 3, 5, 19].
* **In-Browser Python Sketch Engine:** A custom, NumPy-first computer vision pipeline running locally inside a Web Worker via **Pyodide**[cite: 1, 3, 7]. Converts photos into clean outlines and tonal sketches using Gaussian filtering, Sobel, Canny (NMS + hysteresis), Otsu thresholding, morphology, and XDoG[cite: 3, 7, 21].
* **Optional Edge AI:** Decoupled **TEED** deep learning edge detection running via **ONNX Runtime Web (WASM)**, leaving the core camera and Python tools completely responsive even if AI is disabled[cite: 2, 3, 8].
* **Offline-First & Verified Backups:** Full offline caching via Service Workers[cite: 3, 10], local persistence in IndexedDB[cite: 3, 11], and SHA-256 verified ZIP export/restore[cite: 10, 14].

## 🛠 Tech Stack

* **Frontend / PWA:** TypeScript, HTML/CSS, Vite, Service Worker, IndexedDB (`idb`)[cite: 3]
* **Local Compute:** Pyodide (WebAssembly), NumPy[cite: 1, 3, 28]
* **Edge AI (Optional):** ONNX Runtime Web (WASM), TEED[cite: 3]
* **Packaging & Testing:** `fflate` (ZIP), `pytest`, Playwright[cite: 3]

## 📁 Repository Structure

* `app/` — Vite + TypeScript PWA (camera, overlay UI, workers, IndexedDB, offline cache)[cite: 28]
* `python_engine/` — Standalone NumPy-first computer vision package & unit tests[cite: 28]
* `ai/` — TEED ONNX export scripts, model manifest, and license notes[cite: 28]
* `experiments/` — Benchmark CLI, fixtures, and evaluation metrics[cite: 28]
