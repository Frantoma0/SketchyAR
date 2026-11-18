# SketchyAR v0.4.12 — Home: wallpaper to the bottom, lower layout, 20 px gaps

## Cause of the short wallpaper
The texture was painted on `html`, which has a zero-height box (every view is `position:fixed`),
so `cover` sized it by width only: 402 px wide x 1.32 aspect = ~531 px tall, as in the screenshots.

## Changes
- Wallpaper is now `.sketchy-home::before` (fixed, full viewport, `cover`). `html` keeps only
  `#f6f6f6` (the texture average) so a system-drawn strip does not show a seam. The JS
  `--sketchy-wallpaper-height` workaround from v0.4.11 is removed.
- Sections are laid out with exactly 20 CSS px between them (new, load, heading, polaroid rows,
  footer). Sections are scaled; gaps are not (`--g` = 20 px / scale, set in `home.ts`).
- Home Screen: block anchored to the bottom, 20 px below the status bar and 20 px above the
  home-indicator inset.
- Safari tab: block anchored to the top; 96 px reserved at the bottom for the floating address bar
  (`SAFARI_BOTTOM_RESERVE` in `home.ts`; iOS exposes no API for its height).

## Check on iPhone
1. Diagnostics shows version 0.4.12 and the new commit.
2. Safari and Home Screen: texture reaches the bottom edge; no flat strip.
3. Safari: the footer row ends above the address bar. Home Screen: block sits lower.
4. If something is off, export diagnostics: `home.layout` now has `topClear`, `bottomClear`,
   `availableH`, `blockH`, `contentScale`, `visualHeight`, `innerHeight`, `screenHeight`.
