# Behaviors — jalangmbb.tanwanjern.com

Captured with Chrome DevTools MCP at 1440×876 (DPR 2) and 390×844 (DPR 3, mobile + touch).

## Global
- No page scroll: `body:has(.explorer)` sets `height:100%; overflow:hidden`.
- No smooth-scroll library (no Lenis/Locomotive). GSAP is bundled; used for camera/character tweens.
- All buttons: `transition: background .18s, color .18s, transform .12s, box-shadow .18s`; `button:active { transform: scale(.95) }`.
- Focus ring: `outline: 3px solid var(--accent-deep); outline-offset: 2px`.
- `prefers-reduced-motion: reduce` disables the keyframe animations (4 media blocks in gmbb.css).
- Keyframes: `pop-in` (menus, modals), `slide-in` (side panel), `rise`, `bob`, `pulse-ring`, `flip-word-in`, `step-fire`, `step-heat`, `tenant-story-progress`.

## Header
- Audio toggle: `aria-pressed=true` + speaker icon when on; speakerOff icon when muted. Title "Sound is on".
- Settings button: toggles `.menu-panel` (`aria-expanded`). Open state paints the button black (`--accent`) with white icon (see screenshot `desktop-1440-settings-open.png`). Panel animates `pop-in .18s both`.
- Message button: opens the "We're making interactive 3D maps for …" modal.
- Wordmark: opens the "What's GMBB?" modal.
- Step counter: increments as the character walks (`aria-label="N virtual steps walked"`). `step-fire` / `step-heat` animations play on milestones.

## Settings menu (click-driven)
- Items: Mode (submenu, value "Follow"), Music (submenu, value "Hiphop lofi"), Gender (toggle, value "Male"), Browse spaces (count 51).
- Submenus expand inline (`.menu-sub`, pop-in); the item gains class `expanded` and its chevron gets inline `transform: rotate(180deg)`. One submenu open at a time. Settings button gains class `open` (bg #111, white icon).
- Mode options: Follow, Eye level. Music options (in order): Chill lofi, Hiphop lofi, Rock. Gender toggles Male ↔ Female. Active option: bg #757575, white, radius 16px.
- Browse spaces closes the menu and opens the directory side panel.

## Level rail / picker (click-driven)
- Desktop rail lists 9, 8, 7, 6, 5, 3A, 3, 2, 1, G top to bottom. Active chip: black bg, white text. Unavailable (G, 5, 6, 7): `aria-disabled=true`, opacity .38, cursor default.
- Mobile (≤600px): rail hidden; `.floor-picker-button` "Level 1" opens `.floor-picker-panel` listing "Level 9 … Level G" buttons (650 13px Nunito, bold `<b>` 900).
- Changing level fades `.floor-transition` to opacity 1, swaps the floor, fades out; status text "Level N ready.".

## Zoom (click-driven)
- `.follow-zoom` − / + buttons change camera distance; wheel/pinch also zooms.

## 3D world
- Canvas background `#f2f2f2`; camera perspective fov 45, near .1, far 400, initial position [34, 38, 42].
- Lights: ambient 1.1–1.5, directional [10,24,8] 2.1, hemisphere `#ffffff`/`#8a8d85` 1.
- Palette: near-white walls/floors (`#f5f5f2`, `#e8eae2`, `#e0dbd0`), dark accents `#303038` / `#252524`, avatar ring `#4d537e`.
- Controls: WASD walk, Space jump (plays `/audio/jump.wav`), drag to turn, E opens the nearby shop. Mobile: left joystick (`.stick-pad` 172px, knob 72px, `transform .05s linear`) and Jump button (92px).
- Labels (drei Html): "YOU" pill above the character, "Level picker" pill over the lift pad, "↑ Level 2" / "↓ Level G · Coming soon" escalator pills, `.nearby-shop-pill` with shop name + chevron when near a unit.
- BGM `/audio/bgm-bossa.mp3` ("Bossa Antigua", Kevin MacLeod, CC BY 4.0; chill/rock variants) loops when sound is on.

## Directory side panel
- Opens with `slide-in .28s cubic-bezier(.2,.8,.3,1) both`. Close button top-right.
- Search input filters by name, unit or category (placeholder "Find a name, unit or category").
- List scrolls inside the panel. Items: 52px thumb (photo or generated placeholder art), name/category/unit, arrow icon. Clicking an item walks the character to that unit.

## Modals
- Backdrop click or close button dismisses. Modal animates `pop-in`; background blurs (see screenshot).
- Message modal heading cycles the last word through "malls. / markets. / festivals. / exhibitions. / cities." with `flip-word-in` (current word grey `#8a8a8a`).

## Responsive
- ≤600px: header regroups (Settings + Message left via `order:-1`, wordmark absolutely centred 17px, audio + steps right), rail → picker button, keyboard hints hidden, note wraps to two lines at 8px, touch sticks shown on touch devices.
- Other breakpoints in gmbb.css: 640, 700, 780, 900, 1000, 1100px, plus `(hover:none) and (pointer:coarse)`.
