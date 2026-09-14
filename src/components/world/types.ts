import type { RefObject } from "react";
import type { CameraMode, CharacterGender, FloorId } from "@/types/gmbb";

/** Shared mutable input written by keyboard handlers and the touch sticks, read every frame. */
export interface WorldInput {
  /** Joystick vector, x = right, y = forward, each in [-1, 1]. */
  move: { x: number; y: number };
  /** Set true to request a jump; the rig resets it to false once consumed. */
  jump: boolean;
}

/** Request to walk to a unit; `nonce` changes on every request so repeats retrigger. */
export interface WalkTarget {
  unitId: string;
  nonce: number;
}

export interface PlayerRigProps {
  floor: FloorId;
  cameraMode: CameraMode;
  /** Camera distance from the character, ZOOM_MIN..ZOOM_MAX. */
  zoom: number;
  gender: CharacterGender;
  soundOn: boolean;
  walkTarget: WalkTarget | null;
  inputRef: RefObject<WorldInput>;
  onSteps: (steps: number) => void;
  onNearby: (unitId: string | null) => void;
  onZoomChange: (zoom: number) => void;
  onOpenLevelPicker: () => void;
}

export interface WorldCanvasProps extends PlayerRigProps {
  nearbyUnitId: string | null;
  onSelectUnit: (unitId: string) => void;
  onReady: () => void;
}
