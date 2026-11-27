# SketchyAR Day 33.3 — Adaptive Quadrant Matching Hotfix

**App version remains v0.33.0.** This update addresses repeated `quadrant-align.no-consensus` failures reported during real use of Day 33.2.

## What changed
- Replaced strict mutual ratio-tested feature matching with a partial-sketch matcher that keeps up to two plausible local correspondences per reference feature. Geometry and adjacent-cell consensus reject false alternatives.
- Increased the bounded feature pool and distributes keypoints spatially so highly textured parts of an image do not consume the entire feature budget.
- Lowered the required inlier count from 8 to 6 and reduced the minimum confidence floor, while retaining the two-neighbouring-cell requirement and a single global similarity transform.
- Uses deterministic pseudo-random RANSAC pair sampling rather than a fixed index stride that could repeatedly sample a narrow subset for certain match counts.
- Fills the reference canvas white before drawing an image, preventing transparent PNG areas from becoming black features.
- Adds detailed rejection diagnostics: failure stage, reference/camera feature counts, coarse matches, approximate inliers, supported cells, adjacency links, fine matches and confidence.
- A failed match still does not move the overlay. The app now displays a specific diagnostic message rather than the same generic warning.

## Validation performed
- Full Node regression suite: **217/217 PASS**.
- New tests cover low-contrast pencil-like marks, partial drawings, noisy backgrounds, blank-page diagnostics and continued rejection of disconnected marks.
- Focused TypeScript strict check for the changed camera and alignment modules: **PASS** with local TypeScript 5.8.3 and temporary declarations for Vite build globals.
- Production Vite build and real iPhone Safari/Home Screen camera test: **not verified in this environment**.

## Geometry and limitations
The editor still applies one global translation, uniform scale and rotation. It does not yet apply a perspective homography or mesh warp. Keep the phone approximately perpendicular to the flat paper, with the whole white page visible against a darker matte surface. Feature matching can still fail when the original is very different from the drawing, when the marks are extremely faint, or when there are too few distinctive corners/intersections. The new diagnostics expose where the failure occurs rather than claiming that synthetic tests prove success on every physical drawing.

## Installation and test
Follow `Day33_INSTALL.txt`. Run `node --experimental-strip-types --test tests/*.test.mjs` from `app/`.
