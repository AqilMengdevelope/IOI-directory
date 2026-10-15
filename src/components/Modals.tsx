"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";

interface ModalProps {
  label: string;
  className?: string;
  heading: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ label, className, heading, onClose, children }: ModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, []);

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label={label}>
      <button className="modal-backdrop" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div className={className ? `modal ${className}` : "modal"}>
        <div className="modal-head">
          <strong>{heading}</strong>
          <button ref={closeRef} className="icon-button" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

interface FlipWordProps {
  words: string[];
}

export function FlipWord({ words }: FlipWordProps) {
  const [index, setIndex] = useState(0);
  const count = words.length;

  useEffect(() => {
    if (count < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, 1600);
    return () => window.clearInterval(id);
  }, [count]);

  const safeIndex = count > 0 ? index % count : 0;

  return (
    <span className="flip-word">
      <span className="sr-only">{words.join(", ")}.</span>
      <span className="flip-word-current" aria-hidden="true" key={safeIndex}>
        {words[safeIndex]}.
      </span>
    </span>
  );
}

interface AboutModalProps {
  onClose: () => void;
}

export function AboutModal({ onClose }: AboutModalProps) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <Modal label="What’s IOI City Mall?" className="about-modal" heading="What’s IOI City Mall?" onClose={onClose}>
      {imageFailed ? (
        <div className="gmbb-photo gmbb-photo-empty">[Image]</div>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          className="gmbb-photo"
          alt="IOI City Mall at night"
          src="/maps/ioi/ioi-city-mall-night.jpg"
          onError={() => setImageFailed(true)}
        />
      )}
      <p className="modal-body">
        IOI City Mall is the largest shopping mall in Malaysia, at IOI Resort City in Putrajaya. Its West
        and East wings hold more than 700 shops across two phases, with anchors such as Parkson, AEON,
        Lotus’s and HomePro, GSC cinemas with an IMAX hall, the Icescape ice rink, District 21 and the IOI
        Sports Centre.
      </p>
      <p className="modal-body quiet about-disclaimer">
        <strong>Unofficial fan project.</strong> This is an independent hobby project and is not affiliated
        with, endorsed by, or connected to IOI City Mall, IOI Properties Group, or any of the retailers
        shown. All trademarks, logos and brand names belong to their respective owners and are used for
        identification only. Floor plans, shop details and opening hours may be out of date or inaccurate,
        so check with the mall or the shop before you visit.
      </p>
      <div className="modal-actions gmbb-actions">
        <a
          className="primary-button"
          href="https://www.google.com/maps/dir/?api=1&destination=IOI%20City%20Mall%2C%20Lebuh%20IRC%2C%20IOI%20Resort%20City%2C%2062502%20Putrajaya"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon name="pin" size={18} />
          Get directions
        </a>
        <a className="quiet-button" href="https://www.ioicitymall.com.my/" target="_blank" rel="noopener noreferrer">
          <Icon name="external" size={18} />
          Website
        </a>
      </div>
    </Modal>
  );
}

interface MessageModalProps {
  onClose: () => void;
}

const FLIP_WORDS = ["malls", "markets", "festivals", "exhibitions", "cities"];

export function MessageModal({ onClose }: MessageModalProps) {
  return (
    <Modal
      label="We’re making interactive 3D maps for malls, markets, festivals, exhibitions and cities."
      className="about-modal"
      heading={
        <>
          We’re making interactive 3D maps for <FlipWord words={FLIP_WORDS} />
        </>
      }
      onClose={onClose}
    >
      <p className="modal-body">
        This IOI City Mall walkthrough is a fan-made experiment, not an official IOI product. Most of the information here is gathered from public sources and
        hasn’t been manually verified, so some things may be inaccurate or outdated.
      </p>
      <p className="modal-body">
        We’re exploring a new way to discover the places around us. Instead of another list or directory, we
        want to make exploring places more visual, interactive and fun.
      </p>
      <p className="modal-body">Let us know if…</p>
      <ul className="about-list">
        <li>you find this interesting or useful.</li>
        <li>you want something like this for your place.</li>
        <li>you spot anything inaccurate, outdated, or missing.</li>
        <li>you have an idea for what we should build next.</li>
      </ul>
      <p className="modal-body">We’d love to hear from you.</p>
      <div className="modal-actions">
        <a
          className="primary-button"
          href="https://shadowcraft.notion.site/3daa02de993f8085b6d3ed17b6d3be5a?pvs=105"
          target="_blank"
          rel="noopener noreferrer"
        >
          Get in touch
        </a>
      </div>
    </Modal>
  );
}
