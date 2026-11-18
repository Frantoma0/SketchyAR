# Day 4.19 — Slider fill alignment refinement

## Goal
Fine-tune the dark graphite fill inside the opacity slider so it sits precisely centered within the white tray, matching the Figma reference more closely.

## What changed
- Reduced the horizontal inset of the graphite track from 11px to 10px to match the tray interior width.
- Vertically centered the inner graphite track using `top: 50%` and `transform: translateY(-50%)`.
- Added `overflow: hidden` and `border-radius: 999px` to the track container so the fill stays perfectly clipped inside the rounded shape.
- Centered the thumb vertically with `top: 50%` and `transform: translate(-50%, -50%)`.
- Rounded the clip path on the fill image so the visible graphite section remains visually aligned inside the slot.

## Result
The dark fill now sits more precisely inside the slider shape and follows the white tray more cleanly across the full 0–100% range.
