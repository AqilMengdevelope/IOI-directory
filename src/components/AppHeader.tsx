import type { ReactNode } from "react";

import { Icon } from "@/components/icons";
import { useNow } from "@/hooks/useNow";
import { liveOffers, mallOpenStatus, recentChanges } from "@/lib/whats-on";

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
  /** Toggles the "Find a shop" directory. */
  onOpenDirectory: () => void;
  directoryOpen: boolean;
  /** Toggles the "What's on" panel. */
  onOpenWhatsOn: () => void;
  whatsOnOpen: boolean;
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
  onOpenDirectory,
  directoryOpen,
  onOpenWhatsOn,
  whatsOnOpen,
  settingsMenu,
}: AppHeaderProps) {
  const now = useNow();
  const status = now === null ? null : mallOpenStatus(now);
  // A dot on "What's on" while something changed this week.
  const hasNews = now !== null && recentChanges(now, 7).some((change) => change.type !== "closed");
  const offerCount = now === null ? 0 : liveOffers(now).length;

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
          {status && (
            <button
              type="button"
              className="open-status"
              data-open={status.open}
              title={status.usual ? `Mall hours: ${status.usual} daily` : "Mall hours"}
              onClick={onOpenWhatsOn}
            >
              <span aria-hidden />
              {status.label}
            </button>
          )}
        </div>
        <div className="header-tools">
          <button
            type="button"
            className="whats-on-toggle header-icon"
            aria-label={`What’s on${hasNews ? ", new shops this week" : ""}${offerCount ? `, ${offerCount} offers` : ""}`}
            aria-expanded={whatsOnOpen}
            title="What’s on: new shops, offers and coming soon"
            onClick={onOpenWhatsOn}
          >
            <Icon name="sparkle" size={20} />
            {hasNews && <span className="header-dot" aria-hidden />}
          </button>
          <button
            type="button"
            className="directory-toggle header-icon"
            aria-label="Find a shop"
            aria-expanded={directoryOpen}
            title="Find a shop ( / )"
            onClick={onOpenDirectory}
          >
            <Icon name="search" size={20} />
          </button>
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-logo" src="/ioi/brand/ioicitymall.png" alt="IOI City Mall" width={222} height={108} />
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
