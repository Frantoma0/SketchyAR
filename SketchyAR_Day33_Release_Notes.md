# SketchyAR Day 33.2 — Quadrant-based Automatic Contour Alignment

**App version remains v0.33.0.** This is a focused algorithm update to the previous Day 33.1 contour-alignment hotfix.

## User-facing change
The former mirror button continues to launch automatic alignment. The scan now samples the camera over time and attempts to register a partially traced reference image through local, neighbouring quadrants rather than matching the entire sketch as one feature cloud.

## Implementation
- New dedicated module: `app/src/quadrant-alignment-engine.ts`.
- 4x4 coarse grid with overlapping local feature windows; local Harris-like corners, deterministic BRIEF descriptors and mutual ratio-tested matches.
- One global RANSAC similarity transform is selected only when at least two adjacent 4x4 cells independently support it.
- 6x6 finer matching validates/refines that same transform; no individual tile can move separately.
- Five camera frames are sampled about 125 ms apart. Page bounds must stay stable; the same sheet area is converted to grayscale and fused using a temporal median.
- Existing white-sheet isolation, camera mapping, overlay save path and camera lifecycle are reused.
- No new runtime dependency, network request, model download, camera stream or IndexedDB migration.

## Validation performed
- Node tests: **215/215 PASS**, including adjacent-cell partial alignment, disconnected-cell rejection and temporal-noise suppression.
- Focused TypeScript strict typecheck (including noUnusedLocals/noUnusedParameters): **PASS** with local TypeScript 5.8.3 and a temporary declaration for Vite's environment types.
- `npm ci` did not finish in the isolated environment, so the production Vite build was **not verified**.
- Real iPhone Safari/Home Screen camera test: **pending**.

## Geometry and limitations
The current editor supports a single CSS transform (translation, uniform scale, rotation). It does not yet support full perspective homography or a mesh warp. Hold the phone approximately perpendicular to the flat paper. Use a white sheet against a darker matte surface with all edges visible and draw distinctive features in neighbouring grid cells. Glare, shadows, paper/background merging, motion, occlusion, repeating patterns or very faint pencil may cause rejection. Low-confidence matches preserve the prior overlay placement.

## Installation and test
Follow `Day33_INSTALL.txt`. The full Node regression command is `node --experimental-strip-types --test tests/*.test.mjs` from `app/`.
