# PlayerRig Specification (character, controls, camera)

## Overview
- **Target files:** `src/components/world/PlayerRig.tsx` (named export `PlayerRig`), optional helpers in `src/components/world/character/`
- **Screenshot:** `docs/design-references/desktop-1440-initial.png` — chibi character with "YOU" pill and a ring at its feet, "Level picker" pill on a pad just above it
- **Interaction model:** keyboard (WASD / arrows walk, Space jump, E open nearby), pointer drag on the canvas turns the camera, wheel zooms, touch joystick via shared `inputRef`, directory click → auto-walk (`walkTarget`)
- Renders *inside* an R3F `<Canvas>` owned by `WorldCanvas` (another agent). Must work standalone for tsc.

## Libraries & shared code (already installed / in repo — do not modify)
`three`, `@react-three/fiber`, `@react-three/drei`, `gsap`.
`@/lib/gmbb`: `getFloorPlan`, `getDirectory`, `planToWorld`, `polygonCentre`, `CAMERA_DIRECTION`, `ZOOM_MIN` 18, `ZOOM_MAX` 90, `ZOOM_STEP` 8.
`./types`: `PlayerRigProps`, `WorldInput`, `WalkTarget`.

## Props (exact)
```ts
export function PlayerRig(props: PlayerRigProps): JSX.Element
// floor, cameraMode ("follow" | "eye" | "overview"), zoom, gender ("male" | "female"), soundOn,
// walkTarget, inputRef, onSteps, onNearby, onZoomChange, onOpenLevelPicker
```

## Character
- **female:** load `/models/jalan-girl.glb` with drei `useGLTF` (preload it); scale so height ≈ 1.15 world units; face movement direction.
- **male:** build a chibi from primitives matching the screenshot: head sphere r 0.28 skin `#e9b78f`, black cap (half sphere + brim) `#252524`, body capsule black hoodie `#303038`, blue shorts/jeans `#4d537e`, white shoes `#f5f5f2`. Total height ≈ 1.15.
- Idle bob: body y += sin(t·2.4)·0.02. Walking: slight lean + bob sin(t·12)·0.05.
- **Foot ring:** `ringGeometry [0.36, 0.42, 48]` flat at y 0.02, `meshBasicMaterial color #4d537e transparent opacity .68`; inner disc r 0.36 `#303038` opacity .15.
- **"YOU" pill:** drei `<Html center position={[0, 1.55, 0]} zIndexRange={[12, 10]}>` → `<button type="button" className="avatar-label">YOU</button>` (CSS: 800 8px/12px, letter-spacing 1px, white on #62658b, radius 999px, padding 3px 8px).

## Spawn & Level picker pad
- Spawn at world (x 4.2, z 1.2) on every floor change (just right of the escalators, centre of the corridor). Face camera-forward.
- Pad: disc r 0.55 at spawn + (0, 0.015, −1.4), colour `#e0dbd0` opacity .9; `<Html center position={[padX, 1.0, padZ]}>` → `<button type="button" className="floor-pad-label" onClick={onOpenLevelPicker}>Level picker</button>` (CSS: 800 10px/15px, letter-spacing .4px, color #343434, bg rgba(253,253,248,.9), radius 999px, padding 5px 10px, shadow 0 8px 24px rgba(21,32,43,.094)).
- Standing within 0.8 of the pad center for >400ms calls `onOpenLevelPicker()` once per entry.

## Movement
- Input sources merged each frame: keyboard state (W/A/S/D and arrow keys; ignore when focus is in an input/textarea) + `inputRef.current.move`.
- Direction relative to camera yaw; speed 5.5 units/s; smooth heading with `THREE.MathUtils.damp`.
- Jump: Space keydown or `inputRef.current.jump` (reset to false after reading). Vertical velocity 5.2, gravity −16, only when grounded. If `soundOn`, play `new Audio("/audio/jump.wav")` at volume .6.
- Collision (simple): keep the character inside the floor footprint polygon (point-in-polygon on world coords; if the next position is outside, slide along the axis that stays inside). Units are open-front, so no per-wall collision.
- **Steps:** accumulate horizontal distance; every 0.75 units → `onSteps(1)` (the parent adds to its counter).
- **Nearby:** each 150ms find the closest unit by `planToWorld(unit.labelPoint)` (fallback `polygonCentre(unit.polygon)`); if within 3.2 units call `onNearby(unit.id)`, else `onNearby(null)`. Only call when the value changes.
- **E key:** if a unit is nearby, dispatch `window.dispatchEvent(new CustomEvent("gmbb:open-nearby"))` (the parent listens).
- **walkTarget:** when `walkTarget.nonce` changes, find the unit on the current floor, compute its label point in world coords and tween the character there with gsap (`duration = clamp(distance / 5.5, 0.4, 6)`, `ease: "power1.inOut"`), rotating to face travel direction; count steps during the tween; manual input cancels the tween.

## Camera
- **follow (default):** camera = character + CAMERA_DIRECTION·zoom rotated around Y by the drag yaw; `lookAt(character + (0, 0.8, 0))`; damp position (lambda 6).
- **eye:** camera 1.25 above the character, 3.2 behind along heading, looking forward; zoom ignored.
- **overview:** camera at (0, 95, 0.01) looking at origin (top-down), drag disabled.
- **Drag to turn:** pointerdown/move on `gl.domElement` (not on HTML overlays) adjusts yaw by dx·0.005; set `gl.domElement.style.cursor` to "grabbing" while dragging.
- **Wheel:** `zoom + deltaY·0.04`, clamped to ZOOM_MIN..ZOOM_MAX → `onZoomChange(next)`; `preventDefault` with a passive:false listener.

## Cleanup
Remove every window/canvas listener on unmount; kill gsap tweens; dispose nothing shared.

## Verification
- `npx tsc --noEmit` must pass (no `any`; type drei/fiber refs properly).
- Only create files under `src/components/world/` for the rig. Do not create or edit WorldScene/WorldCanvas or shared files.
