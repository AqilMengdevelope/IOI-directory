# DirectoryPanel Specification

## Overview
- **Target files:** `src/components/DirectoryPanel.tsx` (named export `DirectoryPanel`), `src/components/SpaceArt.tsx` (named export `SpaceArt`)
- **Screenshot:** `docs/design-references/desktop-1440-directory-open.png`
- **Interaction model:** click-driven (open from Settings → Browse spaces; close button); live text filter; list scrolls inside the panel
- **Styling:** global CSS in `src/app/gmbb.css`. Exact DOM + class names; no Tailwind. The only inline style allowed is the generated art background (the site does the same). Read rules for `.side-panel`, `.panel-top`, `.eyebrow`, `.icon-button`, `.panel-heading`, `.directory-note`, `.directory-search`, `.directory-list`, `.directory-item`, `.space-art`, `.generated`, `.thumb`, `.item-text`, `.empty-state`, `@keyframes slide-in`.

## Props
```ts
import type { DirectorySpace, FloorId } from "@/types/gmbb";
interface DirectoryPanelProps {
  floor: FloorId;
  spaces: DirectorySpace[];          // getDirectory(floor) from @/lib/gmbb
  onSelect: (unitId: string) => void;
  onClose: () => void;
}
interface SpaceArtProps { space: Pick<DirectorySpace, "name" | "thumb">; className?: string; slide?: number }
```
`"use client"` (owns the query state).

## DOM Structure (ported 1:1 from the site bundle)
```html
<aside class="side-panel" aria-label="GMBB shops">
  <div class="panel-top">
    <span class="eyebrow">LEVEL {floor} · {spaces.length} SPACES</span>
    <button class="icon-button" aria-label="Close directory" onClick=onClose><Icon name="close" /></button>   <!-- size 20 default... site renders 18: use size={18} -->
  </div>
  <div class="panel-heading">
    <h1>Around this floor</h1>
    <p class="directory-note">Shops, studios and spaces from the floor review.</p>
  </div>
  <label class="directory-search">
    <Icon name="list" size={16} />
    <input value={query} onChange placeholder="Find a name, unit or category" aria-label="Search directory" />
  </label>
  <div class="directory-list">
    {filtered.map(space =>
    <button class="directory-item" key={space.unitId} onClick={() => onSelect(space.unitId)}>
      <SpaceArt space={space} className="thumb" />
      <span class="item-text"><strong>{space.name}</strong><span>{space.category}</span><small>{space.unitNumber}</small></span>
      <Icon name="arrow" size={16} />
    </button>)}
    {!filtered.length && <p class="empty-state">No matching spaces.</p>}
  </div>
</aside>
```
- Filter: `(name + " " + unitNumber + " " + category).toLowerCase().includes(query.toLowerCase())`.
- The eyebrow count is the unfiltered total.

## SpaceArt (ported from the site bundle)
- If `space.thumb`: `<img class="space-art {className}" src={thumb} alt={name} loading="lazy" decoding="async">` (plain img, add the eslint disable comment for `@next/next/no-img-element`).
- Otherwise generated art. Every space without photos uses `artwork = { hue: 230, pattern: "grid" }` on the live site.
  - `hue = (230 + 26 * slide) % 360`; `patterns = ["swirl","grid","speckle","arch","bloom"]`; `pattern = slide === 0 ? "grid" : patterns[(patterns.indexOf("grid") + slide) % 5]`
  - `dark = "hsl(" + hue + " 46% 42%)"`, `light = "hsl(" + ((hue + 38) % 360) + " 70% 72%)"`
```html
<div class="space-art generated {className}" style="background: hsl({hue} 58% 88%)" role="img" aria-label="Placeholder artwork for {name}">
  <svg viewBox="0 0 120 80" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <!-- swirl -->  <circle cx=60 cy=40 r=26 fill=none stroke={dark} strokeWidth=5 strokeLinecap=round strokeDasharray="120 40"/><circle cx=60 cy=40 r=15 fill=none stroke={light} strokeWidth=6 strokeLinecap=round strokeDasharray="60 30"/><circle cx=60 cy=40 r=5 fill={dark}/>
    <!-- grid -->   for x of [24,48,72,96]: <rect x={x-9} y=22 width=18 height=36 rx=6 fill={x%48===0 ? light : dark} opacity={x%48===0 ? .9 : .55}/>
    <!-- speckle --><rect x=18 y=18 width=84 height=44 rx=14 fill={light} opacity=.6/> + circles at [[34,32],[58,26],[80,38],[44,52],[70,54],[92,28]] r={i%2 ? 5 : 7} fill={dark} opacity=.75
    <!-- arch -->   <path d="M30 62V40a30 30 0 0 1 60 0v22" fill=none stroke={dark} strokeWidth=6 strokeLinecap=round/><path d="M46 62V42a14 14 0 0 1 28 0v20" fill={light} opacity=.8/>
    <!-- bloom -->  for r of [0,60,120,180,240,300]: <ellipse cx=60 cy=40 rx=9 ry=22 fill={light} opacity=.75 transform="rotate({r} 60 40)"/> + <circle cx=60 cy=40 r=8 fill={dark}/>
  </svg>
</div>
```
Lucky Bowl renders background rgb(207,213,242) = hsl(230 58% 88%) — use that to verify.

## Computed Styles (exact, desktop 1440)
- `.side-panel`: position absolute; top/right/bottom 12px; width 412px (box 1016,68 → 412×796); flex column; radius 19px; bg linear-gradient(135deg, rgba(255,255,255,.95), rgba(245,245,245,.92)); border 1px solid rgba(255,255,255,.94); shadow inset 0 1px 0 #fff, 0 12px 48px rgba(0,0,0,.086); backdrop-filter blur(30px) saturate(1.5); z-index 50; animation slide-in .28s cubic-bezier(.2,.8,.3,1) both
- `.panel-top`: flex space-between centred; gap 10px; padding 20px 22px 4px; height 56px
- `.eyebrow`: 800 11px/16.5px; letter-spacing 1.4px; color #858585
- `.icon-button`: 32×32; round; color #858585; flex centred
- `.panel-heading`: padding 8px 24px 16px. `h1`: Cherry Bomb One 700 26px/29.9px #0c0d0f. `.directory-note`: 400 12px/19.2px #6f7a6b
- `.directory-search`: flex centred gap 8px; margin 10px 22px 14px; padding 11px; radius 10px; bg #ededed; border 1px solid #dedede; color #666; input 400 12px/18px, transparent, no border/outline
- `.directory-list`: padding 4px 14px 20px; flex 1; overflow-y auto
- `.directory-item`: 382×76.7; flex centred; gap 13px; padding 10px; radius 16px; text-align left; width 100%
- `.thumb`: 52×52; radius 10px; object-fit cover; overflow hidden
- `.item-text`: flex column gap 2px; `strong` 700 14px/18.2px #0c0d0f; `span` 400 12px/18px #858585; `small` 600 11px/16.5px #888
- trailing arrow icon pushed right (check gmbb.css: `.directory-item svg:last-child { margin-left: auto }` or similar)

## States & Behaviors
- Hover `.directory-item`: see `(hover:hover) and (pointer:fine)` block in gmbb.css.
- Entry animation `slide-in`; no exit animation.
- Clicking an item calls `onSelect` (parent walks the character there and keeps the panel open).

## Responsive
- ≤600px: gmbb.css turns the panel into a bottom sheet (check `.side-panel` in the 600px media block: left/right 0, max-height ~55vh, top auto). DOM unchanged.

## Text Content (verbatim)
"LEVEL 1 · 51 SPACES", "Around this floor", "Shops, studios and spaces from the floor review.", "Find a name, unit or category", "No matching spaces."

## Verification
`npx tsc --noEmit` must pass. Only create `src/components/DirectoryPanel.tsx` and `src/components/SpaceArt.tsx`.
