import type { ReactNode } from "react";

import { Icon } from "@/components/icons";

interface AppHeaderProps {
  steps: number;
  soundOn: boolean;
  settingsOpen: boolean;
  onToggleSound: () => void;
  onToggleSettings: () => void;
  /** Opens the "Message us" modal. */
  onOpenMessage: () => void;
  /** Opens the "What’s IOI City Mall?" modal. */
  onOpenAbout: () => void;
  /** Rendered inside `.main-menu` after the Settings button while open. */
  settingsMenu: ReactNode;
}

export function AppHeader({
  steps,
  soundOn,
  settingsOpen,
  onToggleSound,
  onToggleSettings,
  onOpenMessage,
  onOpenAbout,
  settingsMenu,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="header-cluster">
        <div className="header-actions">
          <button
            type="button"
            className="audio-toggle header-icon"
            aria-label={soundOn ? "Mute sound" : "Unmute sound"}
            aria-pressed={soundOn}
            title={soundOn ? "Sound is on" : "Sound is off"}
            onClick={onToggleSound}
          >
            <Icon name={soundOn ? "speaker" : "speakerOff"} size={20} />
          </button>
        </div>
        <div className="header-tools">
          <div className="main-menu">
            <button
              className={`menu-button header-icon${settingsOpen ? " open" : ""}`}
              aria-label="Settings"
              aria-expanded={settingsOpen}
              aria-controls="explorer-more-menu"
              onClick={onToggleSettings}
            >
              <Icon name="cog" size={20} />
              <span>Settings</span>
            </button>
            {settingsOpen && settingsMenu}
          </div>
          <button
            type="button"
            className="about-toggle header-icon"
            aria-label="Message us"
            title="We’re making interactive 3D maps"
            onClick={onOpenMessage}
          >
            <Icon name="chatbot" size={20} />
          </button>
        </div>
      </div>
      <div className="identity">
        <button
          type="button"
          className="wordmark"
          aria-label="What’s IOI City Mall?"
          onClick={onOpenAbout}
        >
          <i>Jalan</i>IOI
        </button>
        <span className="cutaway-draft">3D DRAFT</span>
      </div>
      <div
        className="step-counter"
        aria-label={`${steps} virtual steps walked`}
        title="Steps walked in this visit"
      >
        <Icon name="steps" size={20} />
        <span>{steps}</span>
      </div>
    </header>
  );
}
