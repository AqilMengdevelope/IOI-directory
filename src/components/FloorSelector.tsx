"use client";

import { useEffect, useRef, useState } from "react";
import type { FocusEvent, MouseEvent } from "react";

import { FLOORS, FLOOR_RAIL_ORDER, floorLabel } from "@/lib/mall";
import type { FloorId } from "@/types/mall";

interface FloorSelectorProps {
  floor: FloorId;
  onChange: (floor: FloorId) => void;
}

interface TooltipState {
  x: number;
  y: number;
}

export function FloorSelector({ floor, onChange }: FloorSelectorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pickerOpen]);

  const select = (id: FloorId) => {
    if (!FLOORS[id].available) return;
    onChange(id);
  };

  const showTooltip = (event: MouseEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({ x: rect.left + rect.width / 2, y: rect.bottom + 6 });
  };

  const hideTooltip = () => setTooltip(null);

  return (
    <>
      <div className="floor-rail">
        <span className="floor-rail-label">Level</span>
        <div className="floor-list" role="group" aria-label="Choose a level">
          {FLOOR_RAIL_ORDER.map((id) => {
            const active = id === floor;
            const available = FLOORS[id].available;
            return (
              <button
                key={id}
                type="button"
                className={`level-button floor-chip${active ? " active" : ""}`}
                aria-pressed={active}
                aria-disabled={!available}
                aria-label={floorLabel(id)}
                onClick={() => select(id)}
                onMouseEnter={available ? undefined : showTooltip}
                onMouseLeave={available ? undefined : hideTooltip}
                onFocus={available ? undefined : showTooltip}
                onBlur={available ? undefined : hideTooltip}
              >
                <b>{id}</b>
              </button>
            );
          })}
        </div>
      </div>
      {tooltip && (
        <span className="level-tooltip" role="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          Coming soon
        </span>
      )}

      <div className="floor-picker" ref={pickerRef}>
        <button
          type="button"
          className={`floor-picker-button${pickerOpen ? " open" : ""}`}
          aria-expanded={pickerOpen}
          aria-controls="floor-picker-panel"
          aria-label={`Level ${floor}. Change floor`}
          onClick={() => setPickerOpen((open) => !open)}
        >
          Level {floor}
        </button>
        {pickerOpen && (
          <div
            className="floor-picker-panel"
            id="floor-picker-panel"
            role="group"
            aria-label="Choose a level"
          >
            {FLOOR_RAIL_ORDER.map((id) => {
              const active = id === floor;
              const available = FLOORS[id].available;
              return (
                <button
                  key={id}
                  type="button"
                  className={`level-button${active ? " active" : ""}`}
                  aria-pressed={active}
                  aria-disabled={!available}
                  aria-label={floorLabel(id)}
                  onClick={() => {
                    if (!available) return;
                    onChange(id);
                    setPickerOpen(false);
                  }}
                >
                  <b>Level {id}</b>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
