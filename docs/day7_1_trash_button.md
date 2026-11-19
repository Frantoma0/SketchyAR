# Day 7.1 — Trash button for polaroids

- **UI asset:** `app/public/ui/bin.svg` (user-supplied).
- **Placement:** the upper-right corner of the photo area inside each saved polaroid.
- **Tap target:** 44 × 44 design px, visible icon 29 × 29 px.
- **Tap:** opens the existing confirmation dialog immediately; deletion never happens without confirmation.
- **Cancel:** does not change the project, and focus returns to the trash button.
- **Other controls:** tapping the photo continues to open the project. The lower-right `···` menu still provides rename.
- **Storage:** no migration or data changes; the Day 7 atomic deletion operation is reused.

## iPhone acceptance
1. With two or more projects, verify the bin appears in the top-right corner of every saved polaroid, while empty placeholders have no button.
2. Tap the photo: it opens normally; tap the bin: confirmation opens without opening the photo.
3. Cancel deletion: the project stays. Confirm deletion on a disposable test project: it disappears and diagnostics show no orphans.
4. Long gallery (6 projects): vertical scrolling and the `···` rename control still work.
5. VoiceOver reads `Изтрий проекта <име>` and the button is reachable independently from the project photo.
