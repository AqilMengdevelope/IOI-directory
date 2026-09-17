"use client";

import { Suspense, useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { WORLD_BACKGROUND } from "@/lib/mall";
import { PlayerRig } from "./PlayerRig";
import { WorldScene } from "./WorldScene";
import type { WorldCanvasProps } from "./types";

function ReadySignal({ onReady }: { onReady: () => void }) {
  const firedRef = useRef(false);
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useFrame(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    onReadyRef.current();
  });

  return null;
}

export default function WorldCanvas(props: WorldCanvasProps) {
  return (
    <Canvas
      camera={{ position: [34, 38, 42], fov: 45, near: 1, far: 1600 }}
      dpr={[1, 2]}
      flat
      gl={{ antialias: true }}
      aria-label="Interactive IOI City Mall floor. WASD to walk, space to jump, drag to turn."
      fallback={<div className="world-fallback">WebGL is unavailable. The spaces list still works.</div>}
    >
      <color attach="background" args={[WORLD_BACKGROUND]} />
      <Suspense fallback={null}>
        <WorldScene
          key={props.floor}
          floor={props.floor}
          nearbyUnitId={props.nearbyUnitId}
          onSelectUnit={props.onSelectUnit}
        />
        <PlayerRig
          floor={props.floor}
          cameraMode={props.cameraMode}
          zoom={props.zoom}
          gender={props.gender}
          soundOn={props.soundOn}
          walkTarget={props.walkTarget}
          inputRef={props.inputRef}
          onSteps={props.onSteps}
          onNearby={props.onNearby}
          onZoomChange={props.onZoomChange}
          onOpenLevelPicker={props.onOpenLevelPicker}
        />
      </Suspense>
      <ReadySignal onReady={props.onReady} />
    </Canvas>
  );
}
