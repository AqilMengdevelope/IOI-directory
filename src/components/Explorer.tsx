"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { DirectoryPanel } from "@/components/DirectoryPanel";
import { FloorSelector } from "@/components/FloorSelector";
import { AboutModal, MessageModal, Modal } from "@/components/Modals";
import { SettingsMenu } from "@/components/SettingsMenu";
import { FollowZoom, TouchSticks, WorldBottom } from "@/components/WorldOverlays";
import type { WalkTarget, WorldInput } from "@/components/world/types";
import {
  DEFAULT_FLOOR,
  FLOORS,
  FLOOR_RAIL_ORDER,
  MALL_NAME,
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  floorTitle,
  getDirectory,
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

export function Explorer() {
  const [floor, setFloor] = useState<FloorId>(DEFAULT_FLOOR);
  const [phase, setPhase] = useState<TransitionPhase>("idle");
  const [pendingFloor, setPendingFloor] = useState<FloorId | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>("follow");
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const [gender, setGender] = useState<CharacterGender>("male");
  const [soundOn, setSoundOn] = useState(true);
  const [music, setMusic] = useState<MusicMood>("hiphop");
  const [steps, setSteps] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [nearbyUnitId, setNearbyUnitId] = useState<string | null>(null);
  const [walkTarget, setWalkTarget] = useState<WalkTarget | null>(null);
  const [padPromptSteps, setPadPromptSteps] = useState<number | null>(null);
  const [status, setStatus] = useState(`${floorTitle(DEFAULT_FLOOR)} ready.`);

  const inputRef = useRef<WorldInput>({ move: { x: 0, y: 0 }, jump: false });
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const interactedRef = useRef(false);
  const readyTimerRef = useRef<number | null>(null);
  const stepsRef = useRef(0);

  const spaces = getDirectory(floor);

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
  }, []);

  const changeFloor = useCallback(
    (next: FloorId) => {
      if (next === floor || !FLOORS[next].available || phase !== "idle") return;
      setModal(null);
      setDirectoryOpen(false);
      setSettingsOpen(false);
      setNearbyUnitId(null);
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

  const handleSelectUnit = useCallback(
    (unitId: string) => {
      if (unitId === nearbyUnitId) {
        setDirectoryOpen(true);
      } else {
        walkTo(unitId);
      }
    },
    [nearbyUnitId, walkTo],
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

  // Hide the "Explore another floor?" prompt once the character walks away from the pad.
  const padPromptVisible = padPromptSteps !== null && steps - padPromptSteps < 3 && modal === null;

  // E opens the nearby shop (dispatched by the rig) or the lift picker when standing on the pad.
  useEffect(() => {
    const openNearby = () => setDirectoryOpen(true);
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.key.toLowerCase() === "e" && padPromptVisible) {
        setModal("lift");
      }
    };
    window.addEventListener("mall:open-nearby", openNearby);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mall:open-nearby", openNearby);
      window.removeEventListener("keydown", onKey);
    };
  }, [padPromptVisible]);

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
      data-selected-space={nearbyUnitId ?? ""}
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
            onZoomChange={handleZoomChange}
            onOpenLevelPicker={handleOpenLevelPicker}
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
          <WorldBottom onOpenNote={() => setModal("message")} />
          <TouchSticks inputRef={inputRef} />
          <span className="sr-only" role="status" aria-live="polite">
            {status}
          </span>
        </section>
        {directoryOpen && (
          <DirectoryPanel
            floor={floor}
            spaces={spaces}
            onSelect={walkTo}
            onClose={() => setDirectoryOpen(false)}
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
