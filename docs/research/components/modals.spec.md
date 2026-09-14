# Modals Specification (What's GMBB? + Message us)

## Overview
- **Target file:** `src/components/Modals.tsx` — named exports `Modal`, `AboutModal`, `MessageModal`, `FlipWord`
- **Screenshot:** `docs/design-references/desktop-1440-about-modal.png`
- **Interaction model:** click-driven (open from header, close via backdrop / close button / Escape); FlipWord is time-driven
- **Styling:** global CSS in `src/app/gmbb.css`. Exact DOM + class names; no Tailwind or inline styles. Read rules for `.modal-layer`, `.modal-backdrop`, `.modal`, `.about-modal`, `.modal-head`, `.icon-button`, `.gmbb-photo`, `.gmbb-photo-empty`, `.modal-body`, `.modal-actions`, `.gmbb-actions`, `.primary-button`, `.quiet-button`, `.about-list`, `.flip-word`, `.flip-word-current`, `.sr-only`, and `@keyframes pop-in`, `flip-word-in`.

## Props
```ts
interface ModalProps { label: string; className?: string; heading: React.ReactNode; onClose: () => void; children: React.ReactNode }
interface AboutModalProps { onClose: () => void }
interface MessageModalProps { onClose: () => void }
interface FlipWordProps { words: string[] }
```
`"use client"`. `Modal` listens for Escape on window while mounted, moves focus to the close button on mount, and restores focus to the previously focused element on unmount.

## DOM Structure

### Modal (shared shell)
```html
<div class="modal-layer" role="dialog" aria-modal="true" aria-label="{label}">
  <button class="modal-backdrop" aria-label="Close" tabindex="-1" onClick=onClose></button>
  <div class="modal {className}">
    <div class="modal-head">
      <strong>{heading}</strong>
      <button class="icon-button" aria-label="Close" onClick=onClose><Icon name="close" size={18} /></button>
    </div>
    {children}
  </div>
</div>
```

### AboutModal (label + heading "What’s GMBB?", className "about-modal")
```html
<img class="gmbb-photo" alt="GMBB building" src="/maps/gmbb/gmbb-building.webp">
<!-- if the image errors: <div class="gmbb-photo gmbb-photo-empty">[Image]</div> -->
<p class="modal-body">GMBB is a creative community mall on Jalan Robertson in Bukit Bintang, Kuala Lumpur. Instead of typical retail brands, it’s an enterprising hub and artistic space that brings together Malaysian artists, independent creators and artisanal enterprises.</p>
<div class="modal-actions gmbb-actions">
  <a class="primary-button" href="https://www.google.com/maps/dir/?api=1&destination=GMBB%2C%202%20Jalan%20Robertson%2C%2050150%20Kuala%20Lumpur" target="_blank" rel="noopener noreferrer"><Icon name="pin" size={18} />Get directions</a>
  <a class="quiet-button" href="https://gmbb.com.my/" target="_blank" rel="noopener noreferrer"><Icon name="external" size={18} />Website</a>
</div>
```
Use a plain `<img>` (not next/image) to keep the exact DOM; add `{/* eslint-disable-next-line @next/next/no-img-element */}` above it.

### MessageModal (className "about-modal")
- label: "We’re making interactive 3D maps for malls, markets, festivals, exhibitions and cities."
- heading: `<>We’re making interactive 3D maps for <FlipWord words={["malls", "markets", "festivals", "exhibitions", "cities"]} /></>`
```html
<p class="modal-body">Jalan GMBB is still an experiment. Most of the information here is gathered from public sources and hasn’t been manually verified, so some things may be inaccurate or outdated.</p>
<p class="modal-body">We’re exploring a new way to discover the places around us. Instead of another list or directory, we want to make exploring places more visual, interactive and fun.</p>
<p class="modal-body">Let us know if…</p>
<ul class="about-list">
  <li>you find this interesting or useful.</li>
  <li>you want something like this for your place.</li>
  <li>you spot anything inaccurate, outdated, or missing.</li>
  <li>you have an idea for what we should build next.</li>
</ul>
<p class="modal-body">We’d love to hear from you.</p>
<div class="modal-actions">
  <a class="primary-button" href="https://shadowcraft.notion.site/3daa02de993f8085b6d3ed17b6d3be5a?pvs=105" target="_blank" rel="noopener noreferrer">Get in touch</a>
</div>
```

### FlipWord (ported from the site bundle)
```html
<span class="flip-word">
  <span class="sr-only">{words.join(", ")}.</span>
  <span class="flip-word-current" aria-hidden="true" key={index}>{words[index]}.</span>
</span>
```
- `setInterval` every **1600ms**: `index = (index + 1) % words.length`. Skip the interval when `window.matchMedia("(prefers-reduced-motion: reduce)").matches`. Only start after mount (avoid hydration mismatch). The `key` change remounts the span so the `flip-word-in` animation replays.

## Computed Styles (exact, desktop 1440)
- `.modal-layer`: fixed full screen, padding 20px, grid centred. `.modal-backdrop`: bg rgba(16,19,23,.333) + backdrop blur (screenshot shows the app blurred).
- `.modal.about-modal`: 392px wide; padding 20px; radius 22px; bg rgba(250,250,248,.9); box-shadow 0 22px 52px rgba(21,32,43,.14), inset 0 1px 0 #fff; animation pop-in .18s. About modal height 529 (y 174); Message modal height 633 (y 121).
- `.modal-head`: padding 6px 30px 0; heading `<strong>` Cherry Bomb One 700 28px/35px, centred, #0c0d0f. Close `.icon-button` 32×32 round, color #666a70, top-right (x 869, y 191).
- `.gmbb-photo`: 350×233, radius 12px, bg #ececea, object-fit cover, margin-top 16px.
- `.modal-body`: 400 14px/23.1px Nunito, color #5d6858.
- `.about-list`: padding-left 18px, color #666, 14px/23.1px, item spacing 6px.
- `.modal-actions.gmbb-actions`: two buttons side by side, gap 8px.
- `.primary-button`: 49px tall, padding 14px, radius 999px, bg #101113, color #fff, 700 14px/21px, shadow inset 0 1px 1px rgba(255,255,255,.22), 0 10px 24px rgba(21,32,43,.12); icon + text centred gap 8px. In the Message modal it spans 350px.
- `.quiet-button`: padding 11px 16px, radius 999px, bg #fff, color #222, 650 14px/21px.
- `.flip-word-current`: color #8a8a8a, animation flip-word-in.

## States & Behaviors
- Open: `pop-in` (translateY(8px) scale(.96) → none, .18s both).
- Close: unmount immediately (no exit animation on the live site).
- Escape closes. Backdrop click closes. Buttons get the global transition/active scale.

## Responsive
- ≤600px: modal width becomes `min(392px, 100vw - 40px)` via gmbb.css; nothing else changes.

## Verification
`npx tsc --noEmit` must pass. Only create `src/components/Modals.tsx`.
