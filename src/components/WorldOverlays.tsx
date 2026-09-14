"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { WorldInput } from "@/components/world/types";

interface FollowZoomProps {
  onZoomOut: () => void;
  onZoomIn: () => void;
}

export function FollowZoom({ onZoomOut, onZoomIn }: FollowZoomProps) {
  return (
    <div className="follow-zoom" aria-label="Zoom">
      <button type="button" aria-label="Zoom out" onClick={onZoomOut}>
        {"−"}
      </button>
      <button type="button" aria-label="Zoom in" onClick={onZoomIn}>
        +
      </button>
    </div>
  );
}

interface WorldBottomProps {
  onOpenNote: () => void;
}

export function WorldBottom({ onOpenNote }: WorldBottomProps) {
  return (
    <div className="world-bottom">
      <button type="button" className="cutaway-note" onClick={onOpenNote}>
        Jalan GMBB is still experimental.
        <span className="cutaway-note-rest">{" Map details and information might be inaccurate."}</span>
      </button>
      <div className="controls-help">
        <span className="desktop-controls">
          <kbd>W</kbd>
          <kbd>A</kbd>
          <kbd>S</kbd>
          <kbd>D</kbd> walk <span className="separator">·</span>{" "}
          <kbd>Space</kbd> jump
        </span>
        <span className="separator">·</span>
        <span>Drag to turn</span>
        <span className="desktop-controls">
          <span className="separator">·</span> <kbd>E</kbd> open
        </span>
      </div>
    </div>
  );
}

interface TouchSticksProps {
  inputRef: RefObject<WorldInput>;
}

export function TouchSticks({ inputRef }: TouchSticksProps) {
  const [isTouch, setIsTouch] = useState(false);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const padRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLSpanElement>(null);
  const activePointer = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(hover: none) and (pointer: coarse)");
    const update = () => setIsTouch(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const track = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pad = padRef.current;
    const knobEl = knobRef.current;
    if (!pad || !knobEl) return;
    const rect = pad.getBoundingClientRect();
    const radius = Math.max(1, (rect.width - knobEl.offsetWidth) / 2);
    let dx = event.clientX - (rect.left + rect.width / 2);
    let dy = event.clientY - (rect.top + rect.height / 2);
    const dist = Math.hypot(dx, dy);
    if (dist > radius) {
      dx = (dx / dist) * radius;
      dy = (dy / dist) * radius;
    }
    setKnob({ x: dx, y: dy });
    inputRef.current.move = { x: dx / radius, y: -dy / radius };
  };

  const release = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setKnob({ x: 0, y: 0 });
    inputRef.current.move = { x: 0, y: 0 };
  };

  return (
    <div className="touch-sticks" hidden={!isTouch}>
      <div
        ref={padRef}
        className="stick-pad"
        aria-label="Walk control: drag to move"
        role="application"
        onPointerDown={(event) => {
          if (activePointer.current !== null) return;
          activePointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          track(event);
        }}
        onPointerMove={(event) => {
          if (activePointer.current !== event.pointerId) return;
          track(event);
        }}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <span
          ref={knobRef}
          className="stick-knob"
          style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
        />
      </div>
      <button
        type="button"
        className="jump-button"
        aria-label="Jump"
        onPointerDown={() => {
          inputRef.current.jump = true;
        }}
      >
        Jump
      </button>
    </div>
  );
}
