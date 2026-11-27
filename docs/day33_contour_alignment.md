# Day 33.3 — Adaptive quadrant contour alignment (app v0.33.0)

## Goal
Align the selected reference image to a partially completed pencil/pen drawing on a white sheet. The matcher uses tolerant partial-sketch correspondences in local neighbouring quadrants. A geometric consensus check accepts only one consistent shared placement and rejects false descriptor alternatives.

## Runtime design
- Reuses the existing camera stream; it does not request another camera session.
- Captures five bounded frames (longest side <= 640 px), sampled about 125 ms apart.
- Detects the neutral-bright paper region in each sample and rejects unstable page motion. Three or more stable samples are required.
- Crops the same paper bounds from each sample, converts to grayscale and computes a pixel-wise temporal median. Persistent graphite/ink marks remain; one-frame glare/noise is suppressed.
- The first matcher pass uses a **4x4 grid** with overlapping local feature windows. Harris-like corners and deterministic BRIEF descriptors are matched within each source cell against the camera-page features.
- Mutual ratio-tested local matches vote for one global similarity transform. Deterministic bounded RANSAC scores inliers and requires at least two adjacent 4x4 cells, with at least two consistent inliers per cell.
- The **6x6 pass** performs finer local matching. It is allowed to refine the coarse placement only where the new matches agree with the 4x4 transform; it cannot move individual tiles or create a separate placement.
- A single least-squares similarity transform updates the full artwork: translation, uniform scale and rotation. It is then mapped through natural image/video coordinates and `object-fit: cover` to the camera stage.
- The existing overlay preset writer persists the final placement. No IndexedDB schema change.

## Safety gates
- Locked artwork cannot be auto-positioned until the user unlocks it.
- Missing source/camera frame, unstable paper bounds or too few stable frames are rejected with a visible status message.
- A blank page, disconnected marks, non-adjacent quadrant evidence or low-confidence match cannot move the artwork. Failed attempts include counts for features, candidate matches, inliers and supported cells.
- Scale outside the accepted safety range is rejected.
- The align control remains tappable when prerequisites are missing and reports what needs attention. Only an in-progress scan disables it.
- Manual drag, pinch, rotation, opacity, grid, lock, camera, selected image and project storage remain available.
- All image processing stays on-device. No upload, remote API, AI model or extra camera stream is used.

## Geometry and limitations
The overlay is still represented by the app's existing CSS translation + uniform scale + rotation. This is intentionally one coherent transform for the whole picture; it is not a perspective homography and does not warp each quadrant separately. For best accuracy, place the paper flat and hold the phone approximately perpendicular/parallel to the sheet plane. The paper must be separable from the background (preferably a white sheet on a darker surface), and at least two neighbouring 4x4 cells should contain distinctive drawn details. Strong glare/shadows, motion during sampling, hand occlusion, repetitive shapes, extremely faint marks or a merged white background can prevent a match. On failure, the prior placement is preserved.

## Validation
- Node regression suite: **215/215 PASS**, including partial adjacent-quadrant registration, rejection of disconnected distant quadrants, temporal median, paper segmentation, coordinate conversion and UI guardrails.
- Focused TypeScript strict/no-unused/isolated-modules check: **PASS** using the locally available TypeScript 5.8.3 and a temporary Vite environment declaration.
- Full `npm run build` was **not verified** here: dependency installation (`npm ci`) stalled in the isolated environment and the local Vite CLI was unavailable.
- Real iPhone Safari/Home Screen validation is **pending**. Synthetic tests validate algorithmic geometry, not camera performance, autofocus, lighting or reliability on physical paper.

## Suggested iPhone test
1. Open a saved drawing with the reference image loaded.
2. Put a plain white sheet on a darker, matte surface; keep all four visible edges in frame.
3. Draw distinctive, connected parts of the reference in at least two neighbouring regions of the 4x4 view of the sheet. Use several corners/turns rather than a single straight line.
4. Keep the phone still and approximately perpendicular to the paper for the half-second scan.
5. Unlock the artwork if locked, then tap the contour-alignment button.
6. Check the overlay against the drawn marks. Repeat separately with graphite pencil and dark pen/marker.
7. If it refuses the match, export diagnostics and note the drawing coverage, instrument, camera distance and lighting.
