"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import type { CameraMode, CharacterGender, MusicMood } from "@/types/gmbb";

interface SettingsMenuProps {
  mode: CameraMode;
  music: MusicMood;
  gender: CharacterGender;
  spaceCount: number;
  onModeChange: (mode: CameraMode) => void;
  onMusicChange: (music: MusicMood) => void;
  onGenderToggle: () => void;
  onBrowseSpaces: () => void;
  onClose: () => void;
}

type OpenSub = "mode" | "music" | null;

const MODE_LABELS: Record<CameraMode, string> = {
  follow: "Follow",
  eye: "Eye level",
  overview: "Overview",
};

const MODE_OPTIONS: CameraMode[] = ["follow", "eye"];

const MUSIC_LABELS: Record<MusicMood, string> = {
  chill: "Chill lofi",
  hiphop: "Hiphop lofi",
  rock: "Rock",
};

const MUSIC_OPTIONS: MusicMood[] = ["chill", "hiphop", "rock"];

const GENDER_LABELS: Record<CharacterGender, string> = {
  male: "Male",
  female: "Female",
};

export function SettingsMenu({
  mode,
  music,
  gender,
  spaceCount,
  onModeChange,
  onMusicChange,
  onGenderToggle,
  onBrowseSpaces,
  onClose,
}: SettingsMenuProps) {
  const [openSub, setOpenSub] = useState<OpenSub>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      const container = panel.closest(".main-menu") ?? panel;
      if (event.target instanceof Node && container.contains(event.target)) return;
      onCloseRef.current();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const toggleSub = (sub: Exclude<OpenSub, null>) => {
    setOpenSub((current) => (current === sub ? null : sub));
  };

  const modeOpen = openSub === "mode";
  const musicOpen = openSub === "music";

  return (
    <div
      className="menu-panel"
      id="explorer-more-menu"
      aria-label="Settings"
      ref={panelRef}
    >
      <button
        className={`menu-item submenu${modeOpen ? " expanded" : ""}`}
        aria-expanded={modeOpen}
        onClick={() => toggleSub("mode")}
      >
        <Icon name="layers" size={18} />
        <span>Mode</span>
        <small className="quiet">{MODE_LABELS[mode]}</small>
        <Icon
          name="chevron"
          size={15}
          style={{ transform: modeOpen ? "rotate(180deg)" : "none" }}
        />
      </button>
      {modeOpen && (
        <div className="menu-sub" role="group" aria-label="Camera mode">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option}
              aria-pressed={mode === option}
              className={mode === option ? "active" : ""}
              onClick={() => onModeChange(option)}
            >
              {MODE_LABELS[option]}
            </button>
          ))}
        </div>
      )}
      <button
        className={`menu-item submenu${musicOpen ? " expanded" : ""}`}
        aria-expanded={musicOpen}
        onClick={() => toggleSub("music")}
      >
        <Icon name="speaker" size={18} />
        <span>Music</span>
        <small className="quiet">{MUSIC_LABELS[music]}</small>
        <Icon
          name="chevron"
          size={15}
          style={{ transform: musicOpen ? "rotate(180deg)" : "none" }}
        />
      </button>
      {musicOpen && (
        <div className="menu-sub" role="group" aria-label="Music mood">
          {MUSIC_OPTIONS.map((option) => (
            <button
              key={option}
              aria-pressed={music === option}
              className={music === option ? "active" : ""}
              onClick={() => onMusicChange(option)}
            >
              {MUSIC_LABELS[option]}
            </button>
          ))}
        </div>
      )}
      <button className="menu-item" onClick={onGenderToggle}>
        <Icon name="profile" size={18} />
        <span>Gender</span>
        <small className="quiet">{GENDER_LABELS[gender]}</small>
      </button>
      <button className="menu-item" onClick={onBrowseSpaces}>
        <Icon name="list" size={18} />
        <span>Browse spaces</span>
        <small>{spaceCount}</small>
      </button>
    </div>
  );
}
