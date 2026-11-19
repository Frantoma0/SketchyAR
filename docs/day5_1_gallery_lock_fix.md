# SketchyAR Day 5.1 — Polaroid gallery + Lock state

Based on the user's confirmed Day 5.0 iPhone build, with no changes to camera capture or image overlays.

## Corrections
- The lower-right camera padlock alternates between the previously shipped open `lock.svg` and the user-provided `locked.svg`. The DOM button's pressed state, tooltip and accessible label are synchronized with the lock value.
- New gallery thumbnails are **cover-cropped** to a 320×320 square instead of padded. Their full-resolution source images remain unchanged.
- Previously saved padded thumbnails are automatically regenerated from their original Blob once, sequentially, with a `thumbnailStyle=cover-v2` marker. This updates only the thumbnail record, not the source, project or overlay preset.
- The visible image is clipped inside the actual photo window of the polaroid graphic, which remains the top layer.
- The two-column gallery has its own vertical scroll area. Top buttons and bottom offline bar stay fixed.

## iPhone acceptance test
1. Open an image; tap the lock button twice. The artwork lock must work and the SVG must alternate.
2. Check all **existing** polaroids and add a portrait and landscape photo. They must fill the inner square without white letterboxing or overflowing the frame.
3. Create **at least 6 separate projects**. A photo replacement within one project does **not** create a new entry. Scroll only inside the old-projects area to the fifth and sixth cards; reopen both.
4. Return Home, force-close the PWA, reopen and verify the thumbnails/projects survived.
5. Check diagnostic events `project.gallery.loaded` (count >= 6) and `thumbnail.migrated` for old previews.

## Safety
Do not delete the Home Screen app or reset IndexedDB. This is an additive patch to version 0.5.0.
