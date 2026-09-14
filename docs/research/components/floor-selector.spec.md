# FloorSelector Specification

## Overview
- **Target file:** `src/components/FloorSelector.tsx`
- **Screenshots:** `docs/design-references/desktop-1440-initial.png` (left rail), `docs/design-references/mobile-390-initial.png` ("Level 1" button top-left)
- **Interaction model:** click-driven
- **Styling:** global CSS in `src/app/gmbb.css`. Reproduce DOM + class names exactly; no Tailwind, no inline styles. Read rules for `.floor-rail`, `.floor-rail-label`, `.floor-list`, `.floor-chip`, `.level-button`, `.level-tooltip`, `.floor-picker`, `.floor-picker-button`, `.floor-picker-panel` before writing.

## Props
```ts
import type { FloorId } from "@/types/gmbb";
interface FloorSelectorProps {
  floor: FloorId;
  onChange: (floor: FloorId) => void;
}
```
`"use client"` (owns `pickerOpen` state). Named export `FloorSelector`. Render both the rail and the picker as siblings (a fragment); CSS hides the rail on mobile and shows the picker only at ≤600px.

Use from `@/lib/gmbb`: `FLOOR_RAIL_ORDER` (["9","8","7","6","5","3A","3","2","1","G"]), `FLOORS[id].available`, `floorLabel(id)` → "Level 1 · Art, shops & cafés".

## DOM Structure

### Desktop rail
```html
<div class="floor-rail">
  <span class="floor-rail-label">Level</span>
  <div class="floor-list" role="group" aria-label="Choose a level">
    <!-- one per FLOOR_RAIL_ORDER -->
    <button type="button" class="level-button floor-chip{ active}" aria-pressed="{id===floor}"
      aria-disabled="{!available}" aria-label="{floorLabel(id)}"><b>{id}</b></button>
  </div>
</div>
```
Unavailable levels (G, 5, 6, 7) keep `aria-disabled="true"` and ignore clicks (do not use the `disabled` attribute).

### Mobile picker
```html
<div class="floor-picker">
  <button type="button" class="floor-picker-button" aria-expanded="{pickerOpen}" aria-controls="floor-picker-panel"
    aria-label="Level {floor}. Change floor">Level {floor}</button>
  {pickerOpen &&
  <div class="floor-picker-panel" id="floor-picker-panel" role="group" aria-label="Choose a level">
    <button type="button" class="level-button {active}" aria-pressed aria-disabled aria-label="{floorLabel(id)}"><b>Level {id}</b></button>
    ...
  </div>}
</div>
```
Selecting an available level calls `onChange` and closes the panel. Clicking outside or pressing Escape closes it.

## Computed Styles (exact)

### .floor-rail (desktop)
- position absolute; top 16px; left 16px; z-index 42; box 54×338 at (16, 72 page)
- display flex column; align stretch; gap 5px; padding 6px 4px 8px
- background linear-gradient(135deg, rgba(255,255,255,.88), rgba(242,242,242,.7)); border 1px solid rgba(255,255,255,.94); border-radius 12px
- box-shadow inset 0 1px 0 #fff, 0 6px 24px rgba(0,0,0,.047); backdrop-filter blur(22px) saturate(1.5)

### .floor-rail-label — 9px 700 / 13.5px, letter-spacing .9px, uppercase, color #888, padding 4px 6px 6px

### .floor-list — flex column, gap 2px

### .floor-chip
- 44×27.6; flex centred; padding 6px 4px; border-radius 8px; color #555
- `<b>`: Cherry Bomb One 700 13px/15.6px
- `.active`: background #000, color #fff
- `[aria-disabled=true]`: opacity .38, cursor default

### .floor-picker-button (mobile)
- height 32px; padding 0 12px; border-radius 10px; bg rgba(255,255,255,.95); border 1px solid #fff; shadow 0 6px 20px rgba(0,0,0,.08); font 700 12px/12px Nunito; color #222
- `.floor-picker` absolute top 12px left 12px, z 42

### .floor-picker-panel (mobile, open)
- box 156×391 at (12, 104); padding 8px; border-radius 14px; box-shadow 0 12px 32px rgba(0,0,0,.14); gap 2px
- items `.level-button`: 138×36, padding 8px 10px, radius 8px, font 650 13px/19.5px, color #444; `<b>` weight 900

## States & Behaviors
- Active chip black/white; hover styles come from gmbb.css `(hover:hover)` block.
- Check gmbb.css for `.level-tooltip`: if the rail shows a tooltip on hover/focus, render `<span class="level-tooltip">{floorLabel(id)}</span>` inside each chip exactly as the CSS expects (inspect selector nesting).
- Transitions: global button transition (.18s).

## Responsive Behavior
- **Desktop:** rail visible, picker hidden.
- **Mobile (≤600px):** rail `display:none`, picker visible (66×32 button "Level 1").

## Text Content (verbatim)
"Level", level ids "9 8 7 6 5 3A 3 2 1 G", "Level {id}", aria labels "Level 9 · Creative spaces", "Level 7 · Coming soon", "Level 2 · Studios & makers", "Level 1 · Art, shops & cafés".

## Verification
`npx tsc --noEmit` must pass. Only create `src/components/FloorSelector.tsx`.
