# WorldOverlays Specification

## Overview
- **Target file:** `src/components/WorldOverlays.tsx` (named exports `FollowZoom`, `WorldBottom`, `TouchSticks`)
- **Screenshots:** `docs/design-references/desktop-1440-initial.png` (zoom bottom-right, note + key hints bottom-centre), `docs/design-references/mobile-390-initial.png` (joystick bottom-left, Jump bottom-right, two-line note)
- **Interaction model:** click-driven (zoom), pointer-drag (joystick), press (jump)
- **Styling:** global CSS in `src/app/gmbb.css`. Exact DOM + class names; no Tailwind, no inline styles except the joystick knob transform. Read the rules for `.follow-zoom`, `.world-bottom`, `.cutaway-note`, `.cutaway-note-rest`, `.controls-help`, `.desktop-controls`, `.separator`, `kbd`, `.touch-sticks`, `.stick-pad`, `.stick-knob`, `.jump-button`.

## Props
```ts
import type { RefObject } from "react";
import type { WorldInput } from "@/components/world/types";

interface FollowZoomProps { onZoomOut: () => void; onZoomIn: () => void }
interface WorldBottomProps { onOpenNote: () => void }       // opens the Message us modal
interface TouchSticksProps { inputRef: RefObject<WorldInput> } // writes move + jump
```
File is `"use client"`.

## DOM Structure

### FollowZoom
```html
<div class="follow-zoom" aria-label="Zoom">
  <button type="button" aria-label="Zoom out">−</button>   <!-- U+2212 minus -->
  <button type="button" aria-label="Zoom in">+</button>
</div>
```

### WorldBottom
```html
<div class="world-bottom">
  <button type="button" class="cutaway-note">Jalan GMBB is still experimental.<span class="cutaway-note-rest"> Map details and information might be inaccurate.</span></button>
  <div class="controls-help">
    <span class="desktop-controls"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk <span class="separator">·</span> <kbd>Space</kbd> jump</span>
    <span class="separator">·</span>
    <span>Drag to turn</span>
    <span class="desktop-controls"><span class="separator">·</span> <kbd>E</kbd> open</span>
  </div>
</div>
```

### TouchSticks
Render only when the device is touch-capable: `window.matchMedia("(hover: none) and (pointer: coarse)").matches` evaluated after mount (start hidden to avoid hydration mismatch; use the `hidden` attribute while false).
```html
<div class="touch-sticks" hidden={!isTouch}>
  <div class="stick-pad" aria-label="Walk control: drag to move" role="application">
    <span class="stick-knob" style="transform: translate({kx}px, {ky}px)"></span>
  </div>
  <button type="button" class="jump-button" aria-label="Jump">Jump</button>
</div>
```

## Computed Styles (exact)

### .follow-zoom (desktop)
- position absolute; right 18px; bottom 108px; z-index 40; 42×78; flex column
- background linear-gradient(135deg, rgba(255,255,255,.88), rgba(242,242,242,.7)); border 1px solid rgba(255,255,255,.87); radius 16px
- box-shadow inset 0 1px 0 #fff, 0 6px 24px rgba(0,0,0,.047); backdrop-filter blur(20px) saturate(1.5)
- buttons 40×38; font 700 20px/30px; color #555
- mobile: bottom 208px (x=330, y=558)

### .world-bottom
- position absolute; bottom 0; left/right 0; z-index 40; flex column; align center; gap 9px
- padding 20px 24px (desktop) / 10px 14px 23px (mobile); background linear-gradient(transparent, rgba(242,242,242,.6))
### .cutaway-note — 400 10px/14.5px; letter-spacing .15px; color #888; padding 2px 6px; radius 6px. Mobile 8px/11.6px, wraps to two lines (rest span becomes block).
### .controls-help — flex centred; gap 5px; 500 10px/15px; color #888. Hidden on mobile.
### .desktop-controls — flex; align center; gap 4px
### kbd — ui-monospace 700 10px/15px; color #343434; bg #fff; border 1px solid #c8cbd0; radius 7px; padding 2px 5px; min 20×21 flex centred
### .separator — color #a7b09e

### .touch-sticks — absolute; left 14px; right 14px; bottom 55px; z-index 45; flex; space-between; align flex-end; gap 14px
### .stick-pad — 172×172 (mobile; 124×124 base); radius 50%; display grid centred; same glass gradient/border/shadow/blur as follow-zoom
### .stick-knob — 72×72 (mobile; 52 base); radius 50%; bg #777; box-shadow inset 0 1px 1px rgba(255,255,255,.3), 0 8px 22px rgba(21,32,43,.173); transition transform .05s linear
### .jump-button — 92×92 (mobile; 76 base); radius 50%; glass style; font 700 14px/21px; color #555

## States & Behaviors
- **Joystick:** on pointerdown capture the pointer; knob follows the pointer clamped to radius = (pad size − knob size)/2 (50px on mobile). Write `inputRef.current.move = { x: dx/r, y: -dy/r }` (y positive = up/forward). On pointerup/cancel animate knob back to 0 and set move {0,0}.
- **Jump:** pointerdown sets `inputRef.current.jump = true`.
- **Zoom buttons:** call handlers; global button transition + active scale.
- **Note button:** calls `onOpenNote`.

## Responsive Behavior
- **Desktop 1440:** zoom right 18 / bottom 108; note + key hints centred at bottom; no sticks.
- **Mobile 390 touch:** sticks visible, key hints hidden, note two lines, zoom raised to bottom 208.

## Verification
`npx tsc --noEmit` must pass. Only create `src/components/WorldOverlays.tsx`.
