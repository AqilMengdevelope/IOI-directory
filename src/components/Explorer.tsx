"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { DirectoryPanel } from "@/components/DirectoryPanel";
import { FloorSelector } from "@/components/FloorSelector";
import { AboutModal, MessageModal, Modal } from "@/components/Modals";
import { SettingsMenu } from "@/components/SettingsMenu";
import { TenantPanel } from "@/components/TenantPanel";
import { WhatsOnPanel } from "@/components/WhatsOnPanel";
import { FollowZoom, RouteBanner, TouchSticks, UpDownPrompt, WorldBottom } from "@/components/WorldOverlays";
import type { EscalatorRide, WalkTarget, WorldInput } from "@/components/world/types";
import {
  DEFAULT_FLOOR,
  FLOORS,
  FLOOR_RAIL_ORDER,
  MALL_NAME,
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  adjacentFloor,
  floorTitle,
  getDirectory,
  getEscalators,
  getFloorPlan,
  hasLiftNear,
  planToWorld,
} from "@/lib/mall";
import type { CameraMode, CharacterGender, FloorId, MusicMood } from "@/types/mall";

const WorldCanvas = dynamic(() => import("@/components/world/WorldCanvas"), {
  ssr: false,
  loading: () => <div className="loading-world">Building your view…</div>,
});

type ModalKind = "about" | "message" | "lift" | null;
type TransitionPhase = "idle" | "out" | "waiting";

const FADE_MS = 280;
const READY_TIMEOUT_MS = 1500;
const BGM_VOLUME = 0.35;

/** A trip to a shop picked in the directory, possibly on another level. */
interface Visit {
  floor: FloorId;
  unitId: string;
  name: string;
}

/** A unit's position on its level (levels are pre-aligned, so it's comparable across floors). */
function unitPosition(floor: FloorId, unitId: string): [number, number] | null {
  const unit = getFloorPlan(floor).units.find((candidate) => candidate.id === unitId);
  return unit ? planToWorld(unit.labelPoint) : null;
}

/**
 * The escalator on `floor` heading towards `target` that makes the shortest trip: the walk to its
 * entry plus the distance from where it lets out to the goal. -1 when there's none that way.
 */
function escalatorToward(floor: FloorId, target: FloorId, from: [number, number], goal: [number, number]): number {
  const direction = FLOOR_RAIL_ORDER.indexOf(target) < FLOOR_RAIL_ORDER.indexOf(floor) ? "up" : "down";
  let best = -1;
  let bestScore = Infinity;
  getEscalators(floor).forEach((escalator, index) => {
    if (escalator.direction !== direction) return;
    const score =
      Math.hypot(escalator.entry[0] - from[0], escalator.entry[1] - from[1]) +
      Math.hypot(escalator.exit[0] - goal[0], escalator.exit[1] - goal[1]);
    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}

export function Explorer() {
  const [floor, setFloor] = useState<FloorId>(DEFAULT_FLOOR);
  const [phase, setPhase] = useState<TransitionPhase>("idle");
  const [pendingFloor, setPendingFloor] = useState<FloorId | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>("follow");
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const [gender, setGender] = useState<CharacterGender>("male");
  const [soundOn, setSoundOn] = useState(true);
  const [music, setMusic] = useState<MusicMood>("bossa");
  const [steps, setSteps] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [whatsOnOpen, setWhatsOnOpen] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [nearbyUnitId, setNearbyUnitId] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [nearLift, setNearLift] = useState<[number, number] | null>(null);
  const [nearEscalator, setNearEscalator] = useState<number | null>(null);
  const [ride, setRide] = useState<EscalatorRide | null>(null);
  const [arriveAt, setArriveAt] = useState<[number, number] | null>(null);
  const [walkTarget, setWalkTarget] = useState<WalkTarget | null>(null);
  const [visit, setVisit] = useState<Visit | null>(null);
  const [padPromptSteps, setPadPromptSteps] = useState<number | null>(null);
  const [status, setStatus] = useState(`${floorTitle(DEFAULT_FLOOR)} ready.`);

  const inputRef = useRef<WorldInput>({ move: { x: 0, y: 0 }, jump: false });
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const interactedRef = useRef(false);
  const readyTimerRef = useRef<number | null>(null);
  const stepsRef = useRef(0);
  /** Mirrors `visit` for callbacks that run after a level change (the transition timers). */
  const visitRef = useRef<Visit | null>(null);
  const playerRef = useRef({ x: 0, z: 0 });

  const updateVisit = useCallback((next: Visit | null) => {
    visitRef.current = next;
    setVisit(next);
  }, []);

  // Only setters here, so it's safe to call from the transition timers as well as from the UI.
  const startRide = useCallback((index: number, onFloor: FloorId) => {
    const escalator = getEscalators(onFloor)[index];
    const next = escalator ? adjacentFloor(onFloor, escalator.direction) : null;
    if (!escalator || !next) return false;
    setWalkTarget(null);
    setSelectedUnitId(null);
    setRide({ index, nonce: Date.now() });
    setStatus(`Riding the escalator ${escalator.direction} to ${floorTitle(next)}.`);
    return true;
  }, []);

  const spaces = getDirectory(floor);
  const selectedSpace = selectedUnitId ? (spaces.find((space) => space.unitId === selectedUnitId) ?? null) : null;

  // Background music: one looping element per mood, started after the first user gesture.
  useEffect(() => {
    const audio = new Audio(`/audio/bgm-${music}.mp3`);
    audio.loop = true;
    audio.volume = BGM_VOLUME;
    bgmRef.current = audio;
    if (soundOn && interactedRef.current) {
      audio.play().catch(() => undefined);
    }
    return () => {
      audio.pause();
      bgmRef.current = null;
    };
    // soundOn is handled by the effect below; recreating the element on toggle would restart the track.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [music]);

  useEffect(() => {
    const audio = bgmRef.current;
    if (!audio) return;
    if (soundOn && interactedRef.current) {
      audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }, [soundOn]);

  useEffect(() => {
    const unlock = () => {
      if (interactedRef.current) return;
      interactedRef.current = true;
      if (soundOn) bgmRef.current?.play().catch(() => undefined);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [soundOn]);

  const finishTransition = useCallback((next: FloorId) => {
    if (readyTimerRef.current !== null) {
      window.clearTimeout(readyTimerRef.current);
      readyTimerRef.current = null;
    }
    setPhase("idle");
    setPendingFloor(null);
    setStatus(`${floorTitle(next)} ready.`);
    // Continue a directory trip: walk to the shop if it's on this level, else ride on towards it.
    const trip = visitRef.current;
    if (!trip) return;
    if (trip.floor === next) {
      setSelectedUnitId(trip.unitId);
      setWalkTarget({ unitId: trip.unitId, nonce: Date.now() });
      return;
    }
    const goal = unitPosition(trip.floor, trip.unitId);
    const index = goal ? escalatorToward(next, trip.floor, [playerRef.current.x, playerRef.current.z], goal) : -1;
    if (index === -1 || !startRide(index, next)) {
      visitRef.current = null;
      setVisit(null);
    }
  }, [startRide]);

  // `arrive` is the lift being ridden (world x, z); rail and picker changes arrive at the level spawn.
  const changeFloor = useCallback(
    (next: FloorId, arrive: [number, number] | null = null) => {
      if (next === floor || !FLOORS[next].available || phase !== "idle") return;
      setArriveAt(arrive);
      setNearLift(null);
      setNearEscalator(null);
      setRide(null);
      setModal(null);
      setDirectoryOpen(false);
      setWhatsOnOpen(false);
      setSettingsOpen(false);
      setNearbyUnitId(null);
      setSelectedUnitId(null);
      setWalkTarget(null);
      setPadPromptSteps(null);
      setPendingFloor(next);
      setPhase("out");
      window.setTimeout(() => {
        setFloor(next);
        setPhase("waiting");
        readyTimerRef.current = window.setTimeout(() => finishTransition(next), READY_TIMEOUT_MS);
      }, FADE_MS);
    },
    [floor, phase, finishTransition],
  );

  const handleReady = useCallback(() => {
    if (phase === "waiting") finishTransition(floor);
  }, [phase, floor, finishTransition]);

  const walkTo = useCallback((unitId: string) => {
    setWalkTarget({ unitId, nonce: Date.now() });
  }, []);

  // Picking a shop (3D tile, nearby pill or directory row) opens its profile; far shops also get a walk.
  const handleSelectUnit = useCallback(
    (unitId: string) => {
      setDirectoryOpen(false);
      setWhatsOnOpen(false);
      setSelectedUnitId(unitId);
      if (unitId !== nearbyUnitId) walkTo(unitId);
    },
    [nearbyUnitId, walkTo],
  );

  // Directory pick: walk the route to a shop on this level, or ride escalators level by level to it.
  const visitSpace = useCallback(
    (targetFloor: FloorId, unitId: string) => {
      if (phase !== "idle" || ride !== null) return;
      const name = getDirectory(targetFloor).find((space) => space.unitId === unitId)?.name ?? "the shop";
      setDirectoryOpen(false);
      setWhatsOnOpen(false);
      updateVisit({ floor: targetFloor, unitId, name });
      if (targetFloor === floor) {
        setSelectedUnitId(unitId);
        walkTo(unitId);
        return;
      }
      const goal = unitPosition(targetFloor, unitId);
      const index = goal ? escalatorToward(floor, targetFloor, [playerRef.current.x, playerRef.current.z], goal) : -1;
      // No escalator that way (rare): fall back to switching level directly.
      if (index === -1 || !startRide(index, floor)) changeFloor(targetFloor);
    },
    [floor, phase, ride, changeFloor, walkTo, startRide, updateVisit],
  );

  const cancelVisit = useCallback(() => {
    updateVisit(null);
    setWalkTarget({ unitId: null, nonce: Date.now() });
  }, [updateVisit]);

  const handleWalkEnd = useCallback(
    (reason: "arrived" | "cancelled") => {
      const trip = visitRef.current;
      if (!trip) return;
      if (reason === "cancelled" || trip.floor === floor) updateVisit(null);
    },
    [floor, updateVisit],
  );

  const handleSteps = useCallback((count: number) => {
    stepsRef.current += count;
    setSteps(stepsRef.current);
  }, []);

  const handleZoomChange = useCallback((next: number) => {
    setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)));
  }, []);

  const handleOpenLevelPicker = useCallback(() => {
    setPadPromptSteps(stepsRef.current);
  }, []);

  // Escalator prompt: the bank beside the character offers whichever of up / down it has.
  const escalators = useMemo(() => getEscalators(floor), [floor]);
  const escalatorUp = nearEscalator === null ? -1 : escalators.findIndex((e) => e.bank === nearEscalator && e.direction === "up");
  const escalatorDown = nearEscalator === null ? -1 : escalators.findIndex((e) => e.bank === nearEscalator && e.direction === "down");
  const escalatorUpFloor = escalatorUp === -1 ? null : adjacentFloor(floor, "up");
  const escalatorDownFloor = escalatorDown === -1 ? null : adjacentFloor(floor, "down");
  // Hidden during a directory trip, so walking past escalators doesn't flash prompts.
  const escalatorPromptVisible = nearEscalator !== null && modal === null && phase === "idle" && ride === null && visit === null;

  const rideEscalator = useCallback(
    (index: number) => {
      if (phase !== "idle" || ride !== null) return;
      updateVisit(null);
      startRide(index, floor);
    },
    [phase, ride, floor, startRide, updateVisit],
  );

  const handleRideEnd = useCallback(
    (index: number) => {
      const escalator = escalators[index];
      const next = escalator ? adjacentFloor(floor, escalator.direction) : null;
      setRide(null);
      if (escalator && next) changeFloor(next, escalator.exit);
    },
    [escalators, floor, changeFloor],
  );

  // Lift prompt: only offer a direction when the level above / below has the same lift shaft.
  const liftUp = nearLift ? adjacentFloor(floor, "up") : null;
  const liftDown = nearLift ? adjacentFloor(floor, "down") : null;
  const liftUpFloor = nearLift && liftUp && hasLiftNear(liftUp, nearLift) ? liftUp : null;
  const liftDownFloor = nearLift && liftDown && hasLiftNear(liftDown, nearLift) ? liftDown : null;
  const liftPromptVisible =
    nearLift !== null && modal === null && phase === "idle" && ride === null && visit === null && !escalatorPromptVisible;

  // Hide the "Explore another floor?" prompt once the character walks away from the pad.
  const padPromptVisible = padPromptSteps !== null && steps - padPromptSteps < 3 && modal === null;

  // E opens the nearby shop (dispatched by the rig) or the lift picker when standing on the pad.
  useEffect(() => {
    const openNearby = () => {
      if (nearbyUnitId) setSelectedUnitId(nearbyUnitId);
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const key = event.key.toLowerCase();
      if (key === "/" && modal === null) {
        event.preventDefault();
        setSettingsOpen(false);
        setWhatsOnOpen(false);
        setDirectoryOpen(true);
        return;
      }
      if (key === "e" && padPromptVisible) {
        setModal("lift");
      }
      // Beside an escalator bank or a lift: R goes up, F goes down.
      if (escalatorPromptVisible) {
        if (key === "r" && escalatorUpFloor) rideEscalator(escalatorUp);
        if (key === "f" && escalatorDownFloor) rideEscalator(escalatorDown);
      } else if (liftPromptVisible && nearLift) {
        if (key === "r" && liftUpFloor) changeFloor(liftUpFloor, nearLift);
        if (key === "f" && liftDownFloor) changeFloor(liftDownFloor, nearLift);
      }
    };
    window.addEventListener("mall:open-nearby", openNearby);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mall:open-nearby", openNearby);
      window.removeEventListener("keydown", onKey);
    };
  }, [
    padPromptVisible,
    nearbyUnitId,
    liftPromptVisible,
    nearLift,
    liftUpFloor,
    liftDownFloor,
    changeFloor,
    escalatorPromptVisible,
    escalatorUp,
    escalatorDown,
    escalatorUpFloor,
    escalatorDownFloor,
    rideEscalator,
    modal,
  ]);

  useEffect(
    () => () => {
      if (readyTimerRef.current !== null) window.clearTimeout(readyTimerRef.current);
    },
    [],
  );

  const settingsMenu = (
    <SettingsMenu
      mode={cameraMode}
      music={music}
      gender={gender}
      spaceCount={spaces.length}
      onModeChange={setCameraMode}
      onMusicChange={setMusic}
      onGenderToggle={() => setGender((current) => (current === "male" ? "female" : "male"))}
      onBrowseSpaces={() => {
        setSettingsOpen(false);
        setWhatsOnOpen(false);
        setDirectoryOpen(true);
      }}
      onClose={() => setSettingsOpen(false)}
    />
  );

  return (
    <main
      className="explorer cutaway-explorer"
      data-zone="interior"
      data-camera-mode={cameraMode}
      data-selected-space={selectedUnitId ?? ""}
      data-floor={floor}
      data-character={gender}
      data-sound={soundOn ? "on" : "off"}
      data-bgm={soundOn ? "on" : "off"}
      data-music={music}
      aria-busy={phase !== "idle"}
    >
      <AppHeader
        steps={steps}
        soundOn={soundOn}
        settingsOpen={settingsOpen}
        onToggleSound={() => setSoundOn((current) => !current)}
        onToggleSettings={() => setSettingsOpen((current) => !current)}
        onOpenMessage={() => setModal("message")}
        onOpenAbout={() => setModal("about")}
        onOpenDirectory={() => {
          setSettingsOpen(false);
          setWhatsOnOpen(false);
          setDirectoryOpen((current) => !current);
        }}
        directoryOpen={directoryOpen}
        onOpenWhatsOn={() => {
          setSettingsOpen(false);
          setDirectoryOpen(false);
          setWhatsOnOpen((current) => !current);
        }}
        whatsOnOpen={whatsOnOpen}
        settingsMenu={settingsMenu}
      />
      <div className="workspace">
        <section className="world-region" aria-label={`${MALL_NAME} ${floorTitle(floor)}`}>
          <WorldCanvas
            floor={floor}
            cameraMode={cameraMode}
            zoom={zoom}
            gender={gender}
            soundOn={soundOn}
            walkTarget={walkTarget}
            inputRef={inputRef}
            nearbyUnitId={nearbyUnitId}
            onSteps={handleSteps}
            onNearby={setNearbyUnitId}
            onNearLift={setNearLift}
            arriveAt={arriveAt}
            onZoomChange={handleZoomChange}
            onOpenLevelPicker={handleOpenLevelPicker}
            onNearEscalator={setNearEscalator}
            ride={ride}
            onRideEnd={handleRideEnd}
            onWalkEnd={handleWalkEnd}
            playerRef={playerRef}
            onSelectUnit={handleSelectUnit}
            onReady={handleReady}
          />
          <FloorSelector floor={floor} onChange={changeFloor} />
          <FollowZoom
            onZoomOut={() => handleZoomChange(zoom + ZOOM_STEP)}
            onZoomIn={() => handleZoomChange(zoom - ZOOM_STEP)}
          />
          {padPromptVisible && (
            <button type="button" className="proximity-prompt pad-prompt" onClick={() => setModal("lift")}>
              <span>
                <strong>Explore another floor?</strong>
                <small>Choose a level</small>
              </span>
              <kbd>E</kbd>
            </button>
          )}
          {visit && (
            <RouteBanner
              title={`Heading to ${visit.name}`}
              subtitle={
                visit.floor === floor
                  ? `Follow the red line · ${floorTitle(floor)}`
                  : `Taking the escalator to ${floorTitle(visit.floor)}`
              }
              onCancel={cancelVisit}
            />
          )}
          {escalatorPromptVisible && (
            <UpDownPrompt
              label="Escalator"
              title="Take the escalator?"
              subtitle={`Escalator · you’re on ${floorTitle(floor)}`}
              upTo={escalatorUpFloor && floorTitle(escalatorUpFloor)}
              downTo={escalatorDownFloor && floorTitle(escalatorDownFloor)}
              onUp={() => rideEscalator(escalatorUp)}
              onDown={() => rideEscalator(escalatorDown)}
            />
          )}
          {liftPromptVisible && nearLift && (
            <UpDownPrompt
              label="Lift"
              title="Want to go up or down?"
              subtitle={`Lift · you’re on ${floorTitle(floor)}`}
              upTo={liftUpFloor && floorTitle(liftUpFloor)}
              downTo={liftDownFloor && floorTitle(liftDownFloor)}
              onUp={() => liftUpFloor && changeFloor(liftUpFloor, nearLift)}
              onDown={() => liftDownFloor && changeFloor(liftDownFloor, nearLift)}
            />
          )}
          <WorldBottom onOpenNote={() => setModal("about")} />
          <TouchSticks inputRef={inputRef} />
          <span className="sr-only" role="status" aria-live="polite">
            {status}
          </span>
        </section>
        {directoryOpen && (
          <DirectoryPanel
            floor={floor}
            onVisit={visitSpace}
            onClose={() => setDirectoryOpen(false)}
          />
        )}
        {whatsOnOpen && <WhatsOnPanel floor={floor} onVisit={visitSpace} onClose={() => setWhatsOnOpen(false)} />}
        {selectedSpace && (
          <TenantPanel
            key={selectedSpace.unitId}
            space={selectedSpace}
            onClose={() => setSelectedUnitId(null)}
            onWalkTo={walkTo}
          />
        )}
      </div>
      <div className="floor-transition" data-phase={phase} aria-hidden={phase === "idle"}>
        {pendingFloor && <span>Level {pendingFloor}</span>}
      </div>
      {modal === "about" && <AboutModal onClose={() => setModal(null)} />}
      {modal === "message" && <MessageModal onClose={() => setModal(null)} />}
      {modal === "lift" && (
        <Modal label="Choose a level" className="lift-modal" heading="Choose a level" onClose={() => setModal(null)}>
          <div className="lift-grid">
            {FLOOR_RAIL_ORDER.map((id) => {
              const meta = FLOORS[id];
              return (
                <button
                  key={id}
                  type="button"
                  className={`level-button${id === floor ? " active" : ""}`}
                  aria-pressed={id === floor}
                  aria-disabled={!meta.available}
                  onClick={() => {
                    if (!meta.available) return;
                    setModal(null);
                    changeFloor(id);
                  }}
                >
                  <b>{id}</b>
                  <span>{meta.name}</span>
                </button>
              );
            })}
          </div>
        </Modal>
      )}
    </main>
  );
}
