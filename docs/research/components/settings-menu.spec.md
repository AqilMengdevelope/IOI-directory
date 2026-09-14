# SettingsMenu Specification

## Overview
- **Target file:** `src/components/SettingsMenu.tsx` (named export `SettingsMenu`)
- **Screenshot:** `docs/design-references/desktop-1440-settings-open.png`
- **Interaction model:** click-driven accordion (one submenu open at a time); closes on outside pointerdown or Escape
- **Styling:** global CSS in `src/app/gmbb.css`. Exact DOM + class names; no Tailwind. The chevron's inline `transform` style is part of the live DOM — keep it. Read rules for `.menu-panel`, `.menu-item`, `.submenu`, `.expanded`, `.quiet`, `.menu-sub`, `.menu-sub button`, `.menu-sub .active`.
- Rendered by the parent inside `div.main-menu`, directly after the Settings button (positioned relative to it).

## Props
```ts
import type { CameraMode, CharacterGender, MusicMood } from "@/types/gmbb";
interface SettingsMenuProps {
  mode: CameraMode;                 // only "follow" | "eye" are offered
  music: MusicMood;
  gender: CharacterGender;
  spaceCount: number;
  onModeChange: (mode: CameraMode) => void;
  onMusicChange: (music: MusicMood) => void;
  onGenderToggle: () => void;
  onBrowseSpaces: () => void;
  onClose: () => void;
}
```
`"use client"` (owns `openSub: "mode" | "music" | null`).

Labels: mode `follow → "Follow"`, `eye → "Eye level"`. Music order and labels: `chill → "Chill lofi"`, `hiphop → "Hiphop lofi"`, `rock → "Rock"`. Gender `male → "Male"`, `female → "Female"`.

## DOM Structure (exact, from the live site)
```html
<div class="menu-panel" id="explorer-more-menu" aria-label="Settings">
  <button class="menu-item submenu{openSub==='mode' ? ' expanded' : ''}" aria-expanded="{openSub==='mode'}">
    <Icon name="layers" size={18} /><span>Mode</span><small class="quiet">{modeLabel}</small>
    <Icon name="chevron" size={15} style={{ transform: openSub==='mode' ? "rotate(180deg)" : "none" }} />
  </button>
  {openSub==='mode' &&
  <div class="menu-sub" role="group" aria-label="Camera mode">
    <button aria-pressed="true" class="active">Follow</button>
    <button aria-pressed="false" class="">Eye level</button>
  </div>}
  <button class="menu-item submenu{openSub==='music' ? ' expanded' : ''}" aria-expanded="{openSub==='music'}">
    <Icon name="speaker" size={18} /><span>Music</span><small class="quiet">{musicLabel}</small>
    <Icon name="chevron" size={15} style={{ transform: openSub==='music' ? "rotate(180deg)" : "none" }} />
  </button>
  {openSub==='music' &&
  <div class="menu-sub" role="group" aria-label="Music mood">
    <button aria-pressed class>Chill lofi</button><button …>Hiphop lofi</button><button …>Rock</button>
  </div>}
  <button class="menu-item" onClick=onGenderToggle><Icon name="profile" size={18} /><span>Gender</span><small class="quiet">{genderLabel}</small></button>
  <button class="menu-item" onClick=onBrowseSpaces><Icon name="list" size={18} /><span>Browse spaces</span><small>{spaceCount}</small></button>
</div>
```
- Clicking a submenu header toggles it and closes the other.
- Picking an option calls the handler and keeps the menu open (live behaviour).
- `onBrowseSpaces` — parent closes the menu and opens the directory.
- Outside `pointerdown` (target not inside the closest `.main-menu`) or Escape → `onClose()`.

## Computed Styles (exact, desktop 1440)
- `.menu-panel`: position absolute; top 46px; left −236px (right edge aligns with the Settings button); width 272px; padding 12px; radius 19px; z-index 70
  - background linear-gradient(135deg, rgba(255,255,255,.95), rgba(247,247,247,.92)); border 1px solid rgba(255,255,255,.94)
  - box-shadow 0 18px 56px rgba(0,0,0,.14), inset 0 1px 0 #fff; backdrop-filter blur(40px) saturate(.6); animation pop-in .18s both
- `.menu-item`: 246×41.5; display flex; align center; gap 10px; padding 11px 10px; radius 10px; 600 13px/19.5px Nunito; color #222
  - `.expanded`: background rgba(255,255,255,.46)
  - `small` / `small.quiet`: 600 11px/16.5px; color #888; margin-left auto
- `.menu-sub`: flex column; gap 2px; margin 2px 0 6px 14px; padding-left 12px; animation pop-in
  - buttons: 218×38; flex; gap 9px; padding 9px 12px; radius 16px; 600 13px/19.5px; color #222
  - `.active`: background #757575; color #fff; box-shadow inset 0 1px 0 rgba(255,255,255,.42)

## States & Behaviors
- Hover on `.menu-item` / `.menu-sub button`: see the `(hover:hover) and (pointer:fine)` block in gmbb.css.
- Transitions: global button transition; `.menu-sub` animates `pop-in` on mount.

## Responsive
- ≤600px the Settings button sits at the left of the header; gmbb.css repositions `.menu-panel` (check the 600px media block for left/top overrides). DOM unchanged.

## Text Content (verbatim)
"Mode", "Follow", "Eye level", "Music", "Chill lofi", "Hiphop lofi", "Rock", "Gender", "Male", "Female", "Browse spaces", "51".

## Verification
`npx tsc --noEmit` must pass. Only create `src/components/SettingsMenu.tsx`.
