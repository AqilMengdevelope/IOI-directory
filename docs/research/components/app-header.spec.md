# AppHeader Specification

## Overview
- **Target file:** `src/components/AppHeader.tsx`
- **Screenshots:** `docs/design-references/desktop-1440-initial.png` (top 56px), `docs/design-references/mobile-390-initial.png` (top 52px), `docs/design-references/desktop-1440-settings-open.png` (Settings button active)
- **Interaction model:** click-driven
- **Styling:** all CSS already exists globally in `src/app/gmbb.css` (the site's own stylesheet). Reproduce the exact DOM and class names below; do NOT add Tailwind classes or inline styles. Read the rules for `.app-header`, `.header-*`, `.identity`, `.wordmark`, `.cutaway-draft`, `.step-counter`, `.menu-button`, `.main-menu` in gmbb.css before writing.

## Props
```ts
interface AppHeaderProps {
  steps: number;
  soundOn: boolean;
  settingsOpen: boolean;
  onToggleSound: () => void;
  onToggleSettings: () => void;
  onOpenMessage: () => void;   // Message us modal
  onOpenAbout: () => void;     // What's GMBB? modal
  settingsMenu: React.ReactNode; // rendered inside .main-menu after the button when open (built separately)
}
```
Mark the file `"use client"` only if needed (it has no state of its own; handlers come from props). Named export `AppHeader`.

## DOM Structure (exact order)
```html
<header class="app-header">
  <div class="header-cluster">
    <div class="header-actions">
      <button type="button" class="audio-toggle header-icon"
        aria-label="Mute sound|Unmute sound" aria-pressed="{soundOn}" title="Sound is on|Sound is off">
        <Icon name="speaker|speakerOff" size=20 />
      </button>
    </div>
    <div class="header-tools">
      <div class="main-menu">
        <button class="menu-button header-icon" aria-label="Settings" aria-expanded="{settingsOpen}" aria-controls="explorer-more-menu">
          <Icon name="cog" size=20 /><span>Settings</span>
        </button>
        {settingsOpen && settingsMenu}
      </div>
      <button type="button" class="about-toggle header-icon" aria-label="Message us" title="We’re making interactive 3D maps">
        <Icon name="chatbot" size=20 />
      </button>
    </div>
  </div>
  <div class="identity">
    <button type="button" class="wordmark" aria-label="What’s GMBB?"><i>Jalan</i>GMBB</button>
    <span class="cutaway-draft">3D DRAFT</span>
  </div>
  <div class="step-counter" aria-label="{steps} virtual steps walked" title="Steps walked in this visit">
    <Icon name="steps" size=20 /><span>{steps}</span>
  </div>
</header>
```
Import `Icon` from `@/components/icons`. Use the typographic apostrophe `’` exactly as shown.

## Computed Styles (from getComputedStyle, for verification)

### header.app-header (desktop 1440)
- display flex; justify-content space-between; align-items center; gap 8px
- height 56px; padding 0 22px; position relative; z-index 60
- background rgba(255,255,255,.95); border-bottom 1px solid #fff; box-shadow rgba(136,120,95,.027) 0 3px 20px
- font 400 16px/24px Nunito

### .header-cluster — flex, align center, gap 8px; box at x=1294, 124×36
### .header-actions — flex, gap 8px, 36×36
### .header-tools — flex, gap 8px, 80×36
### .header-icon / .menu-button
- 36×36, display grid, place-items center, border-radius 8px, color #555
- `.menu-button` font 700 12px, gap 7px, backdrop-filter blur(20px) saturate(1.6); its `<span>` is visually hidden by CSS on desktop (box 0×0)
### .identity — flex, align center, gap 12px; box x=22 y=11, 132×33
### .wordmark
- font-family Cherry Bomb One; 800 22px/33px; letter-spacing 1.21px; color #0c0d0f
- display flex; align-items baseline; gap 9px
- `<i>`: weight 600, color #000, not italic
### .cutaway-draft — 8px 800, letter-spacing 1.5px, color #8b775b, bg #eee5d5, border 1px #dfd2bd, radius 6px, padding 4px 7px. Hidden on this page (box 0×0) by CSS; keep it in the DOM.
### .step-counter
- position absolute; left 50%; transform translateX(-50%); display flex; align center; gap 8px
- font 650 12px; color #222; height 55px; `<span>` line-height 20px

## States & Behaviors
- **Audio toggle:** on → icon `speaker`, aria-label "Mute sound", aria-pressed true, title "Sound is on". Off → icon `speakerOff`, aria-label "Unmute sound", aria-pressed false, title "Sound is off".
- **Settings open:** `aria-expanded="true"`; gmbb.css paints the button black with a white icon (see settings-open screenshot). Verify the selector in gmbb.css (search `menu-button`).
- **All buttons:** `transition: background .18s, color .18s, transform .12s, box-shadow .18s`; `:active` scale(.95) — global CSS, nothing to add.
- **Hover:** check `@media (hover:hover) and (pointer:fine)` block in gmbb.css for `.header-icon:hover`.

## Responsive Behavior
- **Desktop (1440px):** wordmark left, step counter centred, audio / settings / message on the right.
- **Mobile (≤600px):** height 52px, padding 0 12px. `.header-cluster` becomes `display: contents`; `.header-tools` gets `order:-1` (Settings + Message at left, x=12); `.header-actions` order 3 (audio at x=299); `.step-counter` order 4 (x=343, height 36px, static). `.identity` is absolutely centred (left 50%, translateX(-50%)); `.wordmark` 17px/25.5px, letter-spacing .68px, gap 5px. All handled by gmbb.css media queries — only the DOM order above matters.

## Assets
- Icons: `speaker`, `speakerOff`, `cog`, `chatbot`, `steps` from `@/components/icons`.

## Text Content (verbatim)
- "Jalan" / "GMBB", "3D DRAFT", "Settings", aria labels as above.

## Verification
- `npx tsc --noEmit` must pass. Do not edit gmbb.css, globals.css, icons.tsx or any file outside your target.
