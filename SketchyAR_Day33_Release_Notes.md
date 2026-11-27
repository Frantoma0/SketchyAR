# SketchyAR Day 33.1 hotfix — Automatic Contour Alignment v0.33.0

## User-facing change
The former mirror button on the Camera/Drawing screen now starts **automatic alignment to the contours already drawn on the sheet**. The user can draw part of the selected reference image on ordinary white paper with either graphite pencil or pen/marker, then tap the new contour-alignment control. The app scans the current camera frame and attempts to register the reference image to those marks.

## Implementation
- New local CV module: `app/src/day33-contour-align.ts`.
- Neutral-bright paper-region detection, morphological gap closing and crop to the sheet interior; the surrounding desk/background is excluded before matching.
- Grayscale conversion and local edge map with a lower threshold for faint graphite lines.
- Harris-like corner candidates, deterministic BRIEF binary descriptors, mutual ratio matching, deterministic RANSAC and least-squares similarity refinement.
- Transform includes translation, uniform scale and rotation.
- Camera frame is bounded to 640 px longest side; matcher internally works at <=480 px.
- Camera coordinates are mapped through the actual video dimensions and `object-fit: cover` to CSS stage coordinates. Fixed the scale conversion for unequal reference/camera canvas resolutions.
- The contour button remains tappable if an image or camera frame is missing, or the artwork is locked; each case now produces a visible status message. It is disabled only while a scan is already running.
- The camera-stage fallback background is white when the live feed is not covering it.
- Uses the existing camera stream and existing overlay placement/persistence path.
- No network calls, cloud inference, AI model, or additional camera request.

## Safety and compatibility
- Low-confidence / insufficient matches do not move the image.
- Locked artwork must be unlocked before automatic placement.
- Scale outside the safety interval is rejected.
- Manual drag, pinch, rotation, opacity, grid, lock, original image and project storage remain available.
- Legacy `mirroredOverlay` remains in the v1 backup schema for compatibility, but the live overlay is no longer mirrored.
- No IndexedDB schema migration.

## Validation performed
- Node tests: **212/212 PASS**.
- Python tests: **295/295 PASS**.
- TypeScript strict typecheck: PASS using a temporary local Vite type declaration in the isolated build workspace; normal dependency install was unavailable in this environment.
- Production Vite build: not verified here.
- Real iPhone testing: pending. Synthetic tests validate geometric transform recovery, not camera performance or reliability on real paper.

## Important limitations
This is a first geometric contour matcher, not semantic AI recognition. It first needs to separate a neutral-bright sheet from its surroundings; a white table/background that merges into the sheet can prevent detection. It needs enough distinctive overlapping marks. It estimates a similarity transform, not full perspective/homography. Strong shadows, glare, hand occlusion, repetitive contours, very light pencil, or a very small partial drawing may prevent alignment. On failure it preserves the existing placement and reports what to correct.

## Suggested iPhone test
1. Open a drawing with its reference image.
2. Use a plain white sheet on a darker surface, camera steady, with the full sheet boundary visible and no strong shadow or glare.
3. Draw several distinctive features with graphite pencil; test again with dark pen/marker.
4. Tap the contour-corners button.
5. Check overlay alignment on the drawn marks. Repeat with early/partial drawings and different camera distances.
6. If it rejects, send the diagnostics export and note the instrument (pencil/pen), approximate amount drawn, and camera distance.
