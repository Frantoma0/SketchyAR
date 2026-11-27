# Day 33 — Automatic contour alignment (v0.33.0)

## Goal
Replace the camera screen's mirror action with a local scan that estimates where the selected reference image has already been drawn on a plain white sheet. Pencil and pen/marker marks are both in scope.

## Runtime design
- Reuses the existing camera stream; it does not request another camera session.
- Captures a bounded camera frame (longest side <= 640 px) and a bounded reference preview.
- Converts both to grayscale and local binary edge maps.
- Detects Harris-like corners, computes deterministic 256-bit BRIEF descriptors, performs mutual ratio-tested matching, and runs deterministic bounded RANSAC for a 2D similarity transform.
- Converts canvas coordinates back to natural image/video coordinates, then accounts for `object-fit: cover` when positioning the overlay in the camera stage.
- Updates translation, uniform scale and rotation only after enough inliers and confidence are found.
- Persists the placement through the existing overlay preset writer. No IndexedDB schema change.

## Safety gates
- Locked artwork cannot be auto-positioned until the user unlocks it.
- Missing source/camera frame is rejected.
- Sparse or ambiguous matches return a helpful status; the current transform is preserved.
- Scale outside the accepted safety range is rejected.
- No image is uploaded; no network, external service, or AI model is used.
- Existing manual gestures remain available.
- Legacy `mirroredOverlay` remains in the v1 backup schema for compatibility but is neutralized in the current camera view.

## Known limitations
This is a first on-device geometric matcher, not semantic recognition. It estimates a similarity transform (translation, rotation, uniform scale), not perspective deformation. It needs enough distinctive overlapping drawn contours. A blank/very lightly marked sheet, strong shadow/glare, hand occlusion, repetitive geometry, or a very small drawing may prevent a match. If the drawing is a perspective-skewed sheet, this version may not align accurately.

## Validation
- Node regression suite: 207 tests passing, including synthetic transform recovery, blank-frame rejection, UI wiring and legacy-mirror neutralization.
- Python regression suite: 295 tests passing.
- TypeScript strict check: passed using a temporary local Vite type declaration because dependency installation was unavailable in the build environment.
- Production Vite build: not verified in this environment.
- Real iPhone validation: pending. Specifically test graphite pencil and dark pen separately, early partial drawings, and multiple camera distances/angles.
