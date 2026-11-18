# SketchyAR v0.4.11 — root wallpaper height fix

## Cause

The application uses fixed-positioned views, so the `html` element may report
`getBoundingClientRect().height === 0`. With `background-size: cover` on `html`,
WebKit can scale the wallpaper to viewport **width** only. The PNG is
1547×2047 px (aspect ≈0.756); at 402 CSS px wide this makes the drawn picture
roughly 532 CSS px high, leaving the flat `#FAF9F7` background below. This
matches the two v0.4.10 screenshots, where the texture ends near mid-screen.

## Change

- The root wallpaper uses an explicit height (`--sketchy-wallpaper-height`) and
  `background-size: auto <height>`, preserving the paper texture aspect ratio.
- The height is calculated once and on viewport resize from screen / visible
  viewport dimensions, but **only for the background image**.
- The content group geometry, Figma spacing, safe area, camera, drawing, gestures,
  navigation and diagnostics are unchanged.
- Status bar meta remains `black-translucent` from v0.4.10, to keep this a
  single-variable test. No Home Screen reinstall is required for the CSS change.

## Verify on iPhone

1. Push the build and confirm version `0.4.11` and new commit in Diagnostics.
2. Inspect Home in Safari and from the Home Screen icon.
3. Confirm the paper texture continues below the second polaroid row and behind
   the footer, without an abrupt switch to a flat color.
4. Check all footer buttons are visible and `Нова рисунка` still opens Drawing.
5. If the final **system-controlled** strip still differs, export diagnostics
   (home.layout) and take screenshots from both modes. The large mid-page
   background break is a separate CSS bug and should be fixed by this change.

## Offline note

Caveat is still fetched via Google Fonts in this development version. Bundle the
OFL-licensed font locally before Offline Ready, without distributing font files
separately to end users.
