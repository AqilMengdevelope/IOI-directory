# Page Topology — jalangmbb.tanwanjern.com

Single-screen app, not a scrolling page. `body` and `html` get `overflow: hidden` when `.explorer` is present (`body:has(.explorer)`), so nothing scrolls except the directory list.

## Layer stack (top to bottom)

| z-index | Element | Position | Interaction model |
|---|---|---|---|
| 200 | `.floor-transition` | fixed, full screen, `#161616`, opacity 0 → 1 during level change (`opacity .28s ease-in-out`) | time-driven |
| modal | `.modal-layer` (About / Message) | full screen, `.modal-backdrop` rgba(16,19,23,.333) + centred `.modal` (pop-in .18s) | click-driven |
| 70 | `.menu-panel` (Settings) | absolute under the Settings button, 272px wide | click-driven |
| 60 | `header.app-header` | relative, 56px desktop / 52px mobile | click-driven |
| 50 | `aside.side-panel` (directory) | absolute inside workspace, top/right/bottom 12px, 412px wide, slide-in .28s | click-driven + text filter |
| 45 | `.touch-sticks` | absolute bottom; only on touch devices | pointer-drag |
| 42 | `.floor-rail` (desktop) / `.floor-picker` (≤600px) | absolute top-left 16px / 12px | click-driven |
| 40 | `.follow-zoom`, `.world-bottom` | absolute bottom-right / bottom | click-driven |
| 10–12 | drei `<Html>` labels in the 3D scene (`.avatar-label`, `.floor-pad-label`, `.escalator-direction`, `.nearby-shop-pill`) | projected from 3D positions | follow 3D camera |
| 0 | `<canvas>` (React Three Fiber) inside `section.world-region` | fills workspace | keyboard (WASD/Space/E), drag-to-turn, wheel/zoom buttons |

## DOM skeleton

```
main.explorer.cutaway-explorer[data-zone=interior][data-camera-mode][data-floor][data-character][data-sound][data-bgm][data-music]
  header.app-header
    div.header-cluster
      div.header-actions > button.audio-toggle.header-icon
      div.header-tools
        div.main-menu > button.menu-button.header-icon (+ div.menu-panel#explorer-more-menu when open)
        button.about-toggle.header-icon
    div.identity > button.wordmark (<i>Jalan</i>GMBB) + span.cutaway-draft "3D DRAFT" (hidden via CSS)
    div.step-counter > svg + span
  div.workspace
    section.world-region[aria-label="GMBB Level 1"]
      canvas (R3F) + drei Html labels
      div.floor-rail (desktop) | div.floor-picker (mobile)
      div.follow-zoom
      div.world-bottom > button.cutaway-note + div.controls-help
      div.touch-sticks (touch only)
      span.sr-only[role=status]
    aside.side-panel (directory, when open)
  div.floor-transition
  div.modal-layer (when a modal is open)
```

## Sections → components

| # | Working name | Component file | Spec |
|---|---|---|---|
| 1 | Header (identity, steps, audio, settings trigger, message trigger) | `src/components/AppHeader.tsx` | `app-header.spec.md` |
| 2 | Settings menu panel + submenus | `src/components/SettingsMenu.tsx` | `settings-menu.spec.md` |
| 3 | Level rail (desktop) + level picker (mobile) | `src/components/FloorSelector.tsx` | `floor-selector.spec.md` |
| 4 | Zoom control, bottom note, keyboard hints, touch sticks | `src/components/WorldOverlays.tsx` | `world-overlays.spec.md` |
| 5 | Directory side panel | `src/components/DirectoryPanel.tsx` | `directory-panel.spec.md` |
| 6 | Modals: What's GMBB? + Message us | `src/components/Modals.tsx` | `modals.spec.md` |
| 7 | 3D world (simplified) | `src/components/world/*` | `world-3d.spec.md` |
| 8 | Page assembly + explorer state | `src/app/page.tsx`, `src/components/Explorer.tsx` | orchestrator |

## Dependencies

- Every overlay reads explorer state (floor, camera mode, zoom, sound, music, gender, steps, open panels). `Explorer.tsx` owns the state and passes props; components stay presentational.
- The 3D world reports step count and zoom back to `Explorer` via callbacks.
- All styling comes from `src/app/gmbb.css` (the site's own stylesheet), so components must reproduce the exact class names and DOM nesting.
