import type { RefObject } from "react";
import type { CameraMode, CharacterGender, FloorId } from "@/types/mall";

/** Shared mutable input written by keyboard handlers and the touch sticks, read every frame. */
export interface WorldInput {
  /** Joystick vector, x = right, y = forward, each in [-1, 1]. */
  move: { x: number; y: number };
  /** Set true to request a jump; the rig resets it to false once consumed. */
  jump: boolean;
}

/** Request to ride an escalator (an index into getEscalators); `nonce` changes on every request. */
export interface EscalatorRide {
  index: number;
  nonce: number;
}

/** Request to walk to a unit (or, with a null unit, to stop); `nonce` changes on every request. */
export interface WalkTarget {
  unitId: string | null;
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
  /** World [x, z] of the lift the character is standing beside, or null when not near one. */
  onNearLift: (lift: [number, number] | null) => void;
  /** World [x, z] to arrive near after a floor change (the lift just used); null uses the level spawn. */
  arriveAt: [number, number] | null;
  onZoomChange: (zoom: number) => void;
  onOpenLevelPicker: () => void;
  /** Bank id of the escalators the character is standing beside, or null when not near any. */
  onNearEscalator: (bank: number | null) => void;
  ride: EscalatorRide | null;
  /** The character has stepped off the end of the escalator in `ride`. */
  onRideEnd: (index: number) => void;
  /** An auto-walk to a shop reached its entrance, or was cancelled by the player taking control. */
  onWalkEnd: (reason: "arrived" | "cancelled") => void;
  /** Written every frame with the character's position, for callers that plan routes. */
  playerRef: RefObject<{ x: number; z: number }>;
}

export interface WorldCanvasProps extends PlayerRigProps {
  nearbyUnitId: string | null;
  onSelectUnit: (unitId: string) => void;
  onReady: () => void;
}
