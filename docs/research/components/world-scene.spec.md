# WorldScene + WorldCanvas Specification (simplified 3D)

## Overview
- **Target files:** `src/components/world/WorldScene.tsx` (geometry + lights + labels), `src/components/world/WorldCanvas.tsx` (R3F `<Canvas>` wrapper, default-exported for `next/dynamic`)
- **Screenshot:** `docs/design-references/desktop-1440-initial.png`, `mobile-390-initial.png`
- **Interaction model:** the scene itself is static; the character + camera live in `PlayerRig` (built by another agent at `src/components/world/PlayerRig.tsx`, props `PlayerRigProps` from `./types`). Import it; if the file does not exist yet in your worktree, create a minimal stub with that exact props signature returning `null`, so tsc passes — the real one will replace it at merge.
- **Scope:** a faithful-feeling *simplified* cutaway, not the site's detailed interiors.

## Libraries (installed)
`three@0.186`, `@react-three/fiber@9`, `@react-three/drei@10`, `gsap@3`. Before using Next APIs read `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md` (Next 16).

## Shared helpers (already in repo, do not modify)
`@/lib/gmbb`: `getFloorPlan(floor)`, `planToWorld([px,py]) → [x,z]`, `polygonCentre`, `PLAN_SCALE` (0.05), `WORLD_BACKGROUND` ("#f2f2f2"), `FLOORS`, `CAMERA_DIRECTION`, `ZOOM_DEFAULT` (62).
Types: `FloorPlan`, `FloorUnit` from `@/types/gmbb`; `WorldCanvasProps` from `./types`.

## WorldCanvas
```tsx
"use client";
export default function WorldCanvas(props: WorldCanvasProps)
```
- `<Canvas>` fills its parent (parent is `section.world-region`, 100%×100%).
- `camera={{ position: [34, 38, 42], fov: 45, near: 0.1, far: 400 }}`, `dpr={[1, 2]}`, `gl={{ antialias: true }}`, `aria-label="Interactive GMBB floor. WASD to walk, space to jump, drag to turn."`
- `fallback={<div className="world-fallback">WebGL is unavailable. The spaces list still works.</div>}`
- `<color attach="background" args={["#f2f2f2"]} />`
- Children: `<WorldScene floor={props.floor} nearbyUnitId={props.nearbyUnitId} onSelectUnit={props.onSelectUnit} />` and `<PlayerRig {...rigProps} />` (every `PlayerRigProps` key), wrapped in `<Suspense fallback={null}>`; key the scene group by floor so it remounts per level.
- Call `props.onReady()` once after the first frame (useEffect inside a child using `useThree`, or `onCreated`).

## WorldScene geometry (world units; 1 unit = 20 plan px)
Props: `{ floor: FloorId; nearbyUnitId: string | null; onSelectUnit: (id: string) => void }`.

1. **Lights** (from the site bundle): `ambientLight intensity 1.1`; `hemisphereLight args ["#ffffff", "#8a8d85", 1]`; `directionalLight position [10, 24, 8] intensity 2.1`.
2. **Ground:** plane 600×600 at y = −0.02, `meshBasicMaterial color #f2f2f2`.
3. **Floor slab:** `THREE.Shape` from `plan.footprint` mapped through `planToWorld`, extruded depth 0.35, rotated so it lies in XZ with top face at y = 0. Material `meshLambertMaterial color #f5f5f2`. Slab edge band: same shape slightly larger, `#e0dbd0`, top at y = −0.01 (reads as the grey outer rim in the screenshot).
4. **Units:** for each `plan.units`:
   - Floor tile: polygon shape, 0.02 thick at y = 0.01, colour `#eeeeea`.
   - Walls: for each polygon edge, a box of thickness 0.12, height 2.2 (open-top cutaway), colour `#e8eae2`; top cap strip 0.14 wide `#f6f1e8`. Leave the edge facing `unit.frontFacing` ("left" | "right" | "up" | "down" in plan space) open as a shopfront except a 0.5-high counter-height lip.
   - One or two furniture blocks per unit for texture: deterministic from unit id hash — e.g. a counter box 1.2×0.9×0.5 colour `#d8d8d4`, and for ~30% of units a dark block `#303038` (the black fixtures visible in the screenshot).
   - Pointer: `onClick` on the unit tile → `onSelectUnit(unit.id)`; `onPointerOver` sets `document.body.style.cursor = "pointer"`, reset on out.
5. **Central atrium (Level 1/2 only):** two large pale blocks (`#cfcfcc`, 7×3.2×9) flanking a void strip with two escalator ramps (dark rails `#252524`, steps `#bdbcb6`) near world origin, matching the centre of the screenshot. Position them at world x ∈ [−2, 6], z ∈ [−4, 4]; keep clear of unit polygons (check with the plan data and nudge if overlapping).
6. **Floors without plan units** (3, 3A, 8, 9): slab only, plus drei `<Html center>` text `<div className="world-fallback">Explore the upper-floor illustration.</div>` at origin y=1.

## Labels (drei `<Html>`; class names styled by gmbb.css)
- Escalator pills near the escalators: `<span className="escalator-direction" aria-label="Up escalator to Level 2">↑ Level 2</span>` and `<span className="escalator-direction" aria-label="Down escalator to Level G coming soon">↓ Level G · Coming soon</span>`; on Level 2 use "↑ Level 3" / "↓ Level 1". Props: `center`, `zIndexRange={[12, 10]}`, `style={{ pointerEvents: "none" }}`.
- Nearby shop pill when `nearbyUnitId` is set, at the unit's label point, y 2.45:
  `<button type="button" className="nearby-shop-pill" aria-label={`Open details for ${name}`} onClick={() => onSelectUnit(id)}><span>{name}</span><Icon name="chevronRight" size={14} /></button>` — name from `getDirectory(floor)` matched by `unitId`. `wrapperClass="nearby-shop-pill-wrap"`, `zIndexRange={[80, 50]}`, `style={{ pointerEvents: "auto" }}`.
- Label CSS (for reference): `.escalator-direction` 650 11px/16.5px, color #333, bg rgba(255,255,255,.875), padding 5px 9px, radius 12px, shadow 0 2px 8px rgba(0,0,0,.05).

## Performance
Build geometries in `useMemo` keyed by floor; merge static wall boxes per unit with `BufferGeometryUtils.mergeGeometries` (from `three/examples/jsm/utils/BufferGeometryUtils.js`) or use instanced meshes; target 60fps on a laptop.

## Visual goal
Monochrome, soft, isometric-looking cutaway: pale grey/white walls, open tops, occasional black fixtures, grey rim. No textures, no shadows needed.

## Verification
- `npx tsc --noEmit` must pass (no `any`).
- Only create files under `src/components/world/` (WorldScene.tsx, WorldCanvas.tsx, and the PlayerRig stub if absent). Do not edit shared files.
