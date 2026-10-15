"use client";

import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import { Group, MathUtils, Vector3 } from "three";
import {
  CAMERA_DIRECTION,
  ESCALATOR_RISE,
  ESCALATOR_RUN,
  ZOOM_MAX,
  ZOOM_MIN,
  escalatorFootprint,
  escalatorPoint,
  getEscalators,
  getFloorPlan,
  getWallSegments,
  nearestStandingPoint,
  planToWorld,
  spawnPoint,
  unitEntrance,
} from "@/lib/mall";
import { findPath, routeLength } from "@/lib/navigation";
import type { Escalator, WallSegment } from "@/lib/mall";
import { FemaleCharacter } from "./character/FemaleCharacter";
import { MaleCharacter } from "./character/MaleCharacter";
import type { CharacterLimbs } from "./character/types";
import { RouteLine } from "./RouteLine";
import type { RouteState } from "./RouteLine";
import type { PlayerRigProps } from "./types";

/** How close (world units; 1 = 2 m) the character must be to a lift for the up/down prompt. */
const LIFT_RADIUS = 4.5;
/** How close the character must be to an escalator's entry for the ride prompt. */
const ESCALATOR_RADIUS = 2.4;
/** Seconds the steps take to carry the character from bottom to top. */
const RIDE_SECONDS = 2.2;
/** Clearance kept from an escalator bank when walking round it to the entry. */
const RIDE_CLEARANCE = 0.45;
/** The level-picker pad sits this far from the spawn point, off the corridor. */
const PAD_OFFSET_Z = -2.4;
const PAD_RADIUS = 0.55;
const PAD_TRIGGER_DISTANCE = 0.8;
const PAD_TRIGGER_DELAY = 0.4;

const WALK_SPEED = 5.5;
/** Holding Shift runs at this multiple of walking speed. */
const SPRINT_MULTIPLIER = 1.8;
const SPRINT_KEYS = ["ShiftLeft", "ShiftRight"];
/** Routes longer than this (world units) are jogged at sprint pace instead of walked. */
const AUTO_SPRINT_DISTANCE = 14;
const EYE_TURN_SPEED = 2.4;
const HEADING_LAMBDA = 12;
const JUMP_VELOCITY = 5.2;
const GRAVITY = -16;
const STEP_LENGTH = 0.75;
const NEARBY_INTERVAL = 0.15;
const NEARBY_RADIUS = 3.2;
const CAMERA_LAMBDA = 6;
const DRAG_SENSITIVITY = 0.005;
const WHEEL_SENSITIVITY = 0.04;

const MOVE_KEYS = {
  forward: ["KeyW", "ArrowUp"],
  back: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
} as const;
const ALL_MOVE_KEYS = new Set<string>(Object.values(MOVE_KEYS).flat());

const UP = new Vector3(0, 1, 0);
const BASE_CAMERA_OFFSET = new Vector3(...CAMERA_DIRECTION);
const scratchOffset = new Vector3();
const scratchDesired = new Vector3();
const scratchLook = new Vector3();

interface RigState {
  x: number;
  z: number;
  y: number;
  vy: number;
  heading: number;
  targetHeading: number;
  yaw: number;
  walkBlend: number;
  /** 0 walking → 1 sprinting, eased so the stride doesn't snap. */
  sprintBlend: number;
  /** Accumulated stride phase in radians; drives arm and leg swing. */
  gait: number;
  /** An auto-walk to a shop is under way (so its end, or a cancel, is reported). */
  walking: boolean;
  /** The current auto-walk is long enough to jog. */
  autoSprint: boolean;
  /** Speed of the route being followed, used to trim the route line behind the character. */
  routeSpeed: number;
  stepDistance: number;
  nearbyTimer: number;
  nearbyId: string | null;
  /** Index into the level's lifts of the one the character is beside, or -1. */
  nearLift: number;
  /** Bank id of the escalators the character is beside, or -1. */
  nearEscalator: number;
  /** "approach" walks to the steps, "glide" stands still on them; input is ignored while riding. */
  riding: "none" | "approach" | "glide";
  padTimer: number;
  padTriggered: boolean;
  jumpQueued: boolean;
  tween: gsap.core.Animation | null;
  proxy: { x: number; z: number; y: number };
  cameraReady: boolean;
  look: Vector3;
}

function createRigState(): RigState {
  return {
    x: 0,
    z: 0,
    y: 0,
    vy: 0,
    heading: 0,
    targetHeading: 0,
    yaw: 0,
    walkBlend: 0,
    sprintBlend: 0,
    gait: 0,
    walking: false,
    autoSprint: false,
    routeSpeed: 0,
    stepDistance: 0,
    nearbyTimer: 0,
    nearbyId: null,
    nearLift: -1,
    nearEscalator: -1,
    riding: "none",
    padTimer: 0,
    padTriggered: false,
    jumpQueued: false,
    tween: null,
    proxy: { x: 0, z: 0, y: 0 },
    cameraReady: false,
    look: new Vector3(),
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function pointInPolygon(x: number, z: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Half the character's footprint; a move is blocked if it passes within this of a wall. */
const BODY_RADIUS = 0.22;

function segmentsIntersect(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): boolean {
  const orient = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number) =>
    Math.sign((qx - px) * (rz - pz) - (qz - pz) * (rx - px));
  return (
    orient(ax, az, bx, bz, cx, cz) !== orient(ax, az, bx, bz, dx, dz) &&
    orient(cx, cz, dx, dz, ax, az) !== orient(cx, cz, dx, dz, bx, bz)
  );
}

function distanceToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax;
  const vz = bz - az;
  const lengthSq = vx * vx + vz * vz || 1e-9;
  const t = MathUtils.clamp(((px - ax) * vx + (pz - az) * vz) / lengthSq, 0, 1);
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

/** True if moving from (x0,z0) to (x1,z1) would cross a wall or end up inside its thickness. */
function crossesWall(x0: number, z0: number, x1: number, z1: number, walls: WallSegment[]): boolean {
  for (const { a, b } of walls) {
    // Cheap reject: bounding box of the wall, padded by the body radius.
    const minX = Math.min(a[0], b[0]) - BODY_RADIUS;
    const maxX = Math.max(a[0], b[0]) + BODY_RADIUS;
    const minZ = Math.min(a[1], b[1]) - BODY_RADIUS;
    const maxZ = Math.max(a[1], b[1]) + BODY_RADIUS;
    if (Math.max(x0, x1) < minX || Math.min(x0, x1) > maxX || Math.max(z0, z1) < minZ || Math.min(z0, z1) > maxZ) continue;
    if (segmentsIntersect(x0, z0, x1, z1, a[0], a[1], b[0], b[1])) return true;
    // Allow moving away from a wall we are already touching; only block moves that get closer.
    const after = distanceToSegment(x1, z1, a[0], a[1], b[0], b[1]);
    if (after < BODY_RADIUS && after < distanceToSegment(x0, z0, a[0], a[1], b[0], b[1])) return true;
  }
  return false;
}

/** Appends one tween per route leg to `timeline`, at a constant `speed`, starting from route[0]. */
function followRoute(timeline: gsap.core.Timeline, proxy: RigState["proxy"], route: [number, number][], speed: number) {
  for (let i = 1; i < route.length; i++) {
    const duration = Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]) / speed;
    if (duration > 0.01) timeline.to(proxy, { x: route[i][0], z: route[i][1], duration, ease: "none" });
  }
}

/**
 * Walking route from (x, z) to an escalator's entry that goes round its bank rather than through the
 * ramps or a floor opening: out to the bank's side, along it, then in to the entry.
 */
function rideApproach(x: number, z: number, target: Escalator, bank: Escalator[]): [number, number][] {
  const c = Math.cos(target.angle);
  const s = Math.sin(target.angle);
  const toLocal = (wx: number, wz: number): [number, number] => [(wx - target.x) * c - (wz - target.z) * s, (wx - target.x) * s + (wz - target.z) * c];
  const corners = bank.flatMap((e) => escalatorFootprint(e).map(([wx, wz]) => toLocal(wx, wz)));
  const minX = Math.min(...corners.map((p) => p[0])) - RIDE_CLEARANCE;
  const maxX = Math.max(...corners.map((p) => p[0])) + RIDE_CLEARANCE;
  const minZ = Math.min(...corners.map((p) => p[1])) - RIDE_CLEARANCE;
  const maxZ = Math.max(...corners.map((p) => p[1])) + RIDE_CLEARANCE;
  const [lx, lz] = toLocal(x, z);
  const entryZ = ESCALATOR_RUN / 2 + 0.6;
  const inBox = (px: number, pz: number) => px > minX && px < maxX && pz > minZ && pz < maxZ;
  let crosses = false;
  for (let i = 1; i < 12 && !crosses; i++) crosses = inBox(lx + (0 - lx) * (i / 12), lz + (entryZ - lz) * (i / 12));
  const route: [number, number][] = [];
  if (crosses) {
    const sideX = Math.abs(lx - minX) < Math.abs(lx - maxX) ? minX : maxX;
    route.push(escalatorPoint(target, sideX, Math.min(lz, maxZ)), escalatorPoint(target, sideX, Math.max(maxZ, entryZ)));
  }
  route.push(target.entry);
  return route;
}

/** Shortest signed angle from `from` to `to`, in (-PI, PI]. */
function angleDelta(from: number, to: number): number {
  return MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI;
}

export function PlayerRig(props: PlayerRigProps) {
  const { floor, gender, onOpenLevelPicker } = props;
  const gl = useThree((state) => state.gl);

  const latest = useRef(props);
  const rig = useRef<RigState>(createRigState());
  const keys = useRef<Set<string>>(new Set());
  const limbs = useRef<CharacterLimbs | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const rootRef = useRef<Group>(null);
  const jumpRef = useRef<Group>(null);
  const headingRef = useRef<Group>(null);
  const leanRef = useRef<Group>(null);

  const floorData = useMemo(() => {
    const plan = getFloorPlan(floor);
    const [spawnX, spawnZ] = spawnPoint(floor);
    return {
      spawn: { x: spawnX, z: spawnZ },
      pad: { x: spawnX, z: spawnZ + PAD_OFFSET_Z },
      footprint: plan.footprint.map((point) => planToWorld(point)),
      walls: getWallSegments(floor),
      lifts: plan.amenities.filter((amenity) => amenity.kind === "lift").map((amenity) => planToWorld(amenity.at)),
      escalators: getEscalators(floor),
      corridor: plan.corridor.map((point) => planToWorld(point)),
      units: plan.units.map((unit) => {
        const [x, z] = planToWorld(unit.labelPoint);
        return { id: unit.id, x, z, entrance: unitEntrance(unit) };
      }),
    };
  }, [floor]);
  const floorDataRef = useRef(floorData);
  const routeRef = useRef<RouteState>({ points: null, version: 0, travelled: 0 });
  const showRoute = useCallback((points: [number, number][] | null) => {
    const route = routeRef.current;
    route.points = points;
    route.version++;
    route.travelled = 0;
  }, []);

  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    floorDataRef.current = floorData;
  }, [floorData]);

  const handleLimbs = useCallback((next: CharacterLimbs | null) => {
    limbs.current = next;
  }, []);

  // Spawn (and reset heading) on mount and whenever the floor changes.
  useEffect(() => {
    const s = rig.current;
    s.tween?.kill();
    s.tween = null;
    // After a lift or escalator ride, step out at the walkway point nearest where the ride ended.
    const arriveAt = latest.current.arriveAt;
    const [spawnX, spawnZ] = (arriveAt && nearestStandingPoint(floor, arriveAt)) ?? [floorData.spawn.x, floorData.spawn.z];
    s.x = spawnX;
    s.z = spawnZ;
    s.walking = false;
    s.routeSpeed = 0;
    showRoute(null);
    s.nearLift = -1;
    s.nearEscalator = -1;
    s.riding = "none";
    s.proxy.y = 0;
    s.y = 0;
    s.vy = 0;
    s.heading = 0;
    s.targetHeading = 0;
    s.stepDistance = 0;
    s.padTimer = 0;
    s.padTriggered = false;
    s.nearbyTimer = NEARBY_INTERVAL;
  }, [floor, floorData, showRoute]);

  // Walk to a shop's entrance along a real route (round shops, not through them), drawn on the floor.
  const walkNonce = props.walkTarget?.nonce;
  useEffect(() => {
    const target = latest.current.walkTarget;
    if (walkNonce === undefined || !target) return;
    const s = rig.current;
    if (s.riding !== "none") return;
    s.tween?.kill();
    s.tween = null;
    const wasWalking = s.walking;
    s.walking = false;
    s.routeSpeed = 0;
    showRoute(null);
    // A null unit is a request to stop.
    if (target.unitId === null) {
      if (wasWalking) latest.current.onWalkEnd("cancelled");
      return;
    }
    const unit = floorDataRef.current.units.find((candidate) => candidate.id === target.unitId);
    if (!unit) return;
    const route = findPath(latest.current.floor, [s.x, s.z], unit.entrance) ?? [
      [s.x, s.z],
      unit.entrance,
    ];
    const length = routeLength(route);
    s.autoSprint = length > AUTO_SPRINT_DISTANCE;
    s.routeSpeed = s.autoSprint ? WALK_SPEED * SPRINT_MULTIPLIER : WALK_SPEED;
    s.walking = true;
    s.proxy.x = s.x;
    s.proxy.z = s.z;
    showRoute(route);
    const timeline = gsap.timeline({
      onComplete: () => {
        const rigState = rig.current;
        if (rigState.tween !== timeline) return;
        rigState.tween = null;
        rigState.walking = false;
        rigState.routeSpeed = 0;
        showRoute(null);
        latest.current.onWalkEnd("arrived");
      },
    });
    followRoute(timeline, s.proxy, route, s.routeSpeed);
    s.tween = timeline;
  }, [walkNonce, showRoute]);

  // Escalator ride: walk round to the entry, step on, glide up (or down) the steps, step off.
  const rideNonce = props.ride?.nonce;
  useEffect(() => {
    const ride = latest.current.ride;
    if (rideNonce === undefined || !ride) return;
    const { escalators } = floorDataRef.current;
    const e = escalators[ride.index];
    if (!e) return;
    const s = rig.current;
    s.tween?.kill();
    s.walking = false;
    s.proxy.x = s.x;
    s.proxy.z = s.z;
    s.proxy.y = 0;
    s.vy = 0;
    s.riding = "approach";
    // Route to the entry round the other ramps; fall back to skirting the bank directly.
    const approach = findPath(latest.current.floor, [s.x, s.z], e.entry) ?? [
      [s.x, s.z] as [number, number],
      ...rideApproach(s.x, s.z, e, escalators.filter((other) => other.bank === e.bank)),
    ];
    s.autoSprint = routeLength(approach) > AUTO_SPRINT_DISTANCE;
    s.routeSpeed = s.autoSprint ? WALK_SPEED * SPRINT_MULTIPLIER : WALK_SPEED;
    showRoute(approach);

    const timeline = gsap.timeline({
      onComplete: () => {
        if (rig.current.tween === timeline) rig.current.tween = null;
        latest.current.onRideEnd(ride.index);
      },
    });
    followRoute(timeline, s.proxy, approach, s.routeSpeed);
    const [firstX, firstZ] = escalatorPoint(e, 0, ESCALATOR_RUN / 2);
    const [lastX, lastZ] = escalatorPoint(e, 0, -ESCALATOR_RUN / 2);
    const rise = e.direction === "up" ? ESCALATOR_RISE : -ESCALATOR_RISE;
    timeline
      .to(s.proxy, { x: firstX, z: firstZ, duration: 0.3, ease: "power1.out" })
      .to(s.proxy, {
        x: lastX,
        z: lastZ,
        y: rise,
        duration: RIDE_SECONDS,
        ease: "none",
        onStart: () => {
          rig.current.riding = "glide";
          rig.current.routeSpeed = 0;
          showRoute(null);
        },
      })
      .to(s.proxy, {
        x: e.exit[0],
        z: e.exit[1],
        duration: 0.3,
        ease: "power1.out",
        onStart: () => {
          rig.current.riding = "approach";
        },
      });
    s.tween = timeline;
  }, [rideNonce, showRoute]);

  // Keyboard: movement keys, Space jump, E open nearby.
  useEffect(() => {
    const pressed = keys.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code === "Space") {
        event.preventDefault();
        if (!event.repeat) rig.current.jumpQueued = true;
        return;
      }
      if (event.code === "KeyE") {
        if (!event.repeat && rig.current.nearbyId) {
          window.dispatchEvent(new CustomEvent("mall:open-nearby"));
        }
        return;
      }
      if (SPRINT_KEYS.includes(event.code)) {
        pressed.add(event.code);
        return;
      }
      if (ALL_MOVE_KEYS.has(event.code)) {
        if (event.code.startsWith("Arrow")) event.preventDefault();
        pressed.add(event.code);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      pressed.delete(event.code);
    };
    const onBlur = () => pressed.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      pressed.clear();
    };
  }, []);

  // Pointer drag to turn, wheel to zoom.
  useEffect(() => {
    const element = gl.domElement;
    let dragging = false;
    let lastX = 0;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || latest.current.cameraMode === "overview") return;
      dragging = true;
      lastX = event.clientX;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      lastX = event.clientX;
      if (dx === 0) return;
      element.style.cursor = "grabbing";
      const s = rig.current;
      if (latest.current.cameraMode === "eye") {
        s.heading -= dx * DRAG_SENSITIVITY;
        s.targetHeading = s.heading;
      } else {
        s.yaw += dx * DRAG_SENSITIVITY;
      }
    };
    const onPointerUp = () => {
      if (!dragging) return;
      dragging = false;
      element.style.cursor = "";
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const { zoom, onZoomChange } = latest.current;
      const next = MathUtils.clamp(zoom + event.deltaY * WHEEL_SENSITIVITY, ZOOM_MIN, ZOOM_MAX);
      if (next !== zoom) onZoomChange(next);
    };

    element.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      element.removeEventListener("wheel", onWheel);
      element.style.cursor = "";
    };
  }, [gl]);

  // Unmount: stop any auto-walk.
  useEffect(() => {
    const s = rig.current;
    return () => {
      s.tween?.kill();
      s.tween = null;
    };
  }, []);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const s = rig.current;
    const p = latest.current;
    const input = p.inputRef.current;
    const pressed = keys.current;
    const mode = p.cameraMode;

    // --- Input ---
    let moveX = input?.move.x ?? 0;
    let moveY = input?.move.y ?? 0;
    if (MOVE_KEYS.forward.some((code) => pressed.has(code))) moveY += 1;
    if (MOVE_KEYS.back.some((code) => pressed.has(code))) moveY -= 1;
    if (MOVE_KEYS.right.some((code) => pressed.has(code))) moveX += 1;
    if (MOVE_KEYS.left.some((code) => pressed.has(code))) moveX -= 1;
    const inputLength = Math.hypot(moveX, moveY);
    if (inputLength > 1) {
      moveX /= inputLength;
      moveY /= inputLength;
    }
    const hasInput = inputLength > 0.01;
    const autoWalking = !!s.tween && s.autoSprint && s.riding !== "glide";
    const sprinting = (hasInput && SPRINT_KEYS.some((code) => pressed.has(code))) || autoWalking;
    s.sprintBlend = MathUtils.damp(s.sprintBlend, sprinting ? 1 : 0, 8, dt);
    const speed = WALK_SPEED * (1 + (SPRINT_MULTIPLIER - 1) * s.sprintBlend);

    if (input?.jump) {
      input.jump = false;
      s.jumpQueued = true;
    }

    const riding = s.riding !== "none";
    if (hasInput && s.tween && !riding) {
      s.tween.kill();
      s.tween = null;
      s.routeSpeed = 0;
      showRoute(null);
      if (s.walking) {
        s.walking = false;
        p.onWalkEnd("cancelled");
      }
    }
    // Trim the route line to what's left: legs are linear, so time × speed is the distance walked.
    if (s.tween && s.routeSpeed > 0 && routeRef.current.points) routeRef.current.travelled = s.tween.time() * s.routeSpeed;

    // --- Horizontal movement ---
    const prevX = s.x;
    const prevZ = s.z;
    if (s.tween) {
      s.x = s.proxy.x;
      s.z = s.proxy.z;
      const dx = s.x - prevX;
      const dz = s.z - prevZ;
      if (dx * dx + dz * dz > 1e-8) s.targetHeading = Math.atan2(dx, dz);
    } else if (hasInput && !riding) {
      let dirX: number;
      let dirZ: number;
      if (mode === "eye") {
        s.heading -= moveX * EYE_TURN_SPEED * dt;
        s.targetHeading = s.heading;
        dirX = Math.sin(s.heading) * moveY;
        dirZ = Math.cos(s.heading) * moveY;
      } else {
        let forwardX = 0;
        let forwardZ = -1;
        if (mode === "follow") {
          scratchOffset.copy(BASE_CAMERA_OFFSET).applyAxisAngle(UP, s.yaw);
          const length = Math.hypot(scratchOffset.x, scratchOffset.z) || 1;
          forwardX = -scratchOffset.x / length;
          forwardZ = -scratchOffset.z / length;
        }
        dirX = forwardX * moveY - forwardZ * moveX;
        dirZ = forwardZ * moveY + forwardX * moveX;
        if (Math.hypot(dirX, dirZ) > 0.01) s.targetHeading = Math.atan2(dirX, dirZ);
      }

      const stepX = dirX * speed * dt;
      const stepZ = dirZ * speed * dt;
      const { footprint, walls } = floorDataRef.current;
      // Try the full step, then each axis alone so the character slides along walls.
      const candidates: [number, number][] = [
        [s.x + stepX, s.z + stepZ],
        [s.x + stepX, s.z],
        [s.x, s.z + stepZ],
      ];
      for (const [nx, nz] of candidates) {
        if (pointInPolygon(nx, nz, footprint) && !crossesWall(s.x, s.z, nx, nz, walls)) {
          s.x = nx;
          s.z = nz;
          break;
        }
      }
    }

    s.heading = MathUtils.damp(s.heading, s.heading + angleDelta(s.heading, s.targetHeading), HEADING_LAMBDA, dt);

    // --- Steps ---
    const travelled = Math.hypot(s.x - prevX, s.z - prevZ);
    s.stepDistance += travelled;
    while (s.stepDistance >= STEP_LENGTH) {
      s.stepDistance -= STEP_LENGTH;
      p.onSteps(1);
    }
    const walking = dt > 0 && travelled / dt > 0.5 && s.riding !== "glide";
    s.walkBlend = MathUtils.damp(s.walkBlend, walking ? 1 : 0, 10, dt);

    // --- Jump ---
    const grounded = s.y <= 0 && s.vy === 0;
    if (riding) {
      s.jumpQueued = false;
      s.y = s.proxy.y;
    } else if (s.jumpQueued) {
      s.jumpQueued = false;
      if (grounded) {
        s.vy = JUMP_VELOCITY;
        if (p.soundOn) {
          audio.current ??= new Audio("/audio/jump.wav");
          audio.current.volume = 0.6;
          audio.current.currentTime = 0;
          audio.current.play().catch(() => undefined);
        }
      }
    }
    if (!riding && (s.y > 0 || s.vy !== 0)) {
      s.vy += GRAVITY * dt;
      s.y += s.vy * dt;
      if (s.y <= 0) {
        s.y = 0;
        s.vy = 0;
      }
    }

    // --- Nearby unit ---
    s.nearbyTimer += dt;
    if (s.nearbyTimer >= NEARBY_INTERVAL) {
      s.nearbyTimer = 0;
      let closestId: string | null = null;
      let closestDistance = NEARBY_RADIUS;
      for (const unit of floorDataRef.current.units) {
        const distance = Math.hypot(unit.x - s.x, unit.z - s.z);
        if (distance <= closestDistance) {
          closestDistance = distance;
          closestId = unit.id;
        }
      }
      if (closestId !== s.nearbyId) {
        s.nearbyId = closestId;
        p.onNearby(closestId);
      }

      // Nearest lift within reach, reported only when it changes.
      let liftIndex = -1;
      let liftDistance = LIFT_RADIUS;
      floorDataRef.current.lifts.forEach(([lx, lz], index) => {
        const distance = Math.hypot(lx - s.x, lz - s.z);
        if (distance <= liftDistance) {
          liftDistance = distance;
          liftIndex = index;
        }
      });
      if (liftIndex !== s.nearLift) {
        s.nearLift = liftIndex;
        p.onNearLift(liftIndex === -1 ? null : floorDataRef.current.lifts[liftIndex]);
      }

      // Nearest escalator entry within reach; its bank gets the up/down prompt.
      let bank = -1;
      if (!riding) {
        let bankDistance = ESCALATOR_RADIUS;
        for (const e of floorDataRef.current.escalators) {
          const distance = Math.hypot(e.entry[0] - s.x, e.entry[1] - s.z);
          if (distance <= bankDistance) {
            bankDistance = distance;
            bank = e.bank;
          }
        }
      }
      if (bank !== s.nearEscalator) {
        s.nearEscalator = bank;
        p.onNearEscalator(bank === -1 ? null : bank);
      }
    }

    // --- Level picker pad ---
    const pad = floorDataRef.current.pad;
    if (Math.hypot(s.x - pad.x, s.z - pad.z) < PAD_TRIGGER_DISTANCE) {
      s.padTimer += dt;
      if (s.padTimer > PAD_TRIGGER_DELAY && !s.padTriggered) {
        s.padTriggered = true;
        p.onOpenLevelPicker();
      }
    } else {
      s.padTimer = 0;
      s.padTriggered = false;
    }

    if (p.playerRef.current) {
      p.playerRef.current.x = s.x;
      p.playerRef.current.z = s.z;
    }

    // --- Character transforms ---
    const t = state.clock.elapsedTime;
    rootRef.current?.position.set(s.x, 0, s.z);
    if (headingRef.current) headingRef.current.rotation.y = s.heading;
    if (jumpRef.current) {
      const idleBob = Math.sin(t * 2.4) * 0.02;
      const walkBob = Math.abs(Math.sin(s.gait / 2)) * (0.05 + 0.03 * s.sprintBlend);
      const bob = MathUtils.lerp(idleBob, walkBob, s.walkBlend);
      jumpRef.current.position.y = s.y + bob;
    }
    if (leanRef.current) leanRef.current.rotation.x = s.walkBlend * (0.12 + 0.1 * s.sprintBlend);
    s.gait += dt * 12 * (1 + 0.5 * s.sprintBlend);
    const swing = Math.sin(s.gait) * (0.7 + 0.25 * s.sprintBlend) * s.walkBlend;
    const limbSet = limbs.current;
    if (limbSet) {
      if (limbSet.leftArm) limbSet.leftArm.rotation.x = swing;
      if (limbSet.rightArm) limbSet.rightArm.rotation.x = -swing;
      if (limbSet.leftLeg) limbSet.leftLeg.rotation.x = -swing;
      if (limbSet.rightLeg) limbSet.rightLeg.rotation.x = swing;
    }

    // --- Camera ---
    const camera = state.camera;
    if (mode === "overview") {
      scratchDesired.set(0, 140, 0.01);
      scratchLook.set(0, 0, 0);
    } else if (mode === "eye") {
      const hx = Math.sin(s.heading);
      const hz = Math.cos(s.heading);
      scratchDesired.set(s.x - hx * 3.2, s.y + 1.25, s.z - hz * 3.2);
      scratchLook.set(s.x + hx * 4, s.y + 1.0, s.z + hz * 4);
    } else {
      scratchLook.set(s.x, s.y + 0.8, s.z);
      scratchOffset.copy(BASE_CAMERA_OFFSET).applyAxisAngle(UP, s.yaw).multiplyScalar(p.zoom);
      scratchDesired.copy(scratchLook).add(scratchOffset);
    }
    if (!s.cameraReady) {
      s.cameraReady = true;
      camera.position.copy(scratchDesired);
      s.look.copy(scratchLook);
    } else {
      const k = 1 - Math.exp(-CAMERA_LAMBDA * dt);
      camera.position.lerp(scratchDesired, k);
      s.look.lerp(scratchLook, k);
    }
    camera.lookAt(s.look);
  });

  return (
    <>
      <RouteLine routeRef={routeRef} />
      <group ref={rootRef} position={[floorData.spawn.x, 0, floorData.spawn.z]}>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.018, 0]}>
          <circleGeometry args={[0.36, 48]} />
          <meshBasicMaterial color="#303038" transparent opacity={0.15} depthWrite={false} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.36, 0.42, 48]} />
          <meshBasicMaterial color="#4d537e" transparent opacity={0.68} depthWrite={false} />
        </mesh>
        <group ref={jumpRef}>
          <group ref={headingRef}>
            <group ref={leanRef}>
              {gender === "female" ? (
                <Suspense fallback={null}>
                  <FemaleCharacter onLimbs={handleLimbs} />
                </Suspense>
              ) : (
                <MaleCharacter onLimbs={handleLimbs} />
              )}
            </group>
          </group>
          <Html center position={[0, 1.55, 0]} zIndexRange={[12, 10]}>
            <button type="button" className="avatar-label">
              YOU
            </button>
          </Html>
        </group>
      </group>

      <mesh rotation-x={-Math.PI / 2} position={[floorData.pad.x, 0.015, floorData.pad.z]}>
        <circleGeometry args={[PAD_RADIUS, 48]} />
        <meshBasicMaterial color="#e0dbd0" transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <Html center position={[floorData.pad.x, 1.0, floorData.pad.z]} zIndexRange={[12, 10]}>
        <button type="button" className="floor-pad-label" onClick={onOpenLevelPicker}>
          Level picker
        </button>
      </Html>
    </>
  );
}
