# v0.4.9 — Root wallpaper test / not a guaranteed iOS 26 fix

## Observed
The v0.4.8 screenshot has a bottom band with near-exact RGB (250,249,247),
which equals the root CSS color `#FAF9F7`. The band appears to be ~60–65 CSS
pixels in the resized iPhone screenshot, not necessarily the 34 px bottom inset.
The Figma group is now fully visible above the band; do not reposition it.

## Only change
- The wallpaper is applied to `html.sketchy-home-active` as one `background-image`,
  with `background-size: cover` and centered at the top.
- The HTML wallpaper `<img>` nested in `.sketchy-home` is removed.
- No changes to the root app layout, Figma transform, camera, gestures, workers,
  SVG assets, font, or status bar settings.
- The wallpaper URL is resolved in `home.ts` using `import.meta.env.BASE_URL` so
  it works both on GitHub Pages and Vite development hosting.

## Manual iPhone 17 checks
1. Open the installed Home Screen SketchyAR (no reinstall).
2. Compare screenshot of the bottom region to v0.4.8.
3. Confirm the buttons and the four empty project tiles remain in exactly the
   same positions; no Home scrolling, clipping or overlays under the time.
4. Open and close Drawing and confirm that the video remains fullscreen.
5. Check diagnostic version 0.4.9 and new commit.
6. If the strip is still present, export the diagnostic JSON (especially the
   `home.layout` event) before trying a different status-bar mode.

## Important limitation
A WebKit Home Screen PWA can expose a viewport smaller than the physical screen.
If the unpainted strip belongs to the iOS standalone chrome outside the web
canvas, changing the CSS background might not eliminate it. Then testing the
meta status-bar style independently would be justified; do not infer that
`100lvh` can escape a viewport clipped by the OS.
