"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { MALL_NAME } from "@/lib/mall";
import type { DirectorySpace } from "@/types/mall";

interface TenantPanelProps {
  space: DirectorySpace;
  onClose: () => void;
  onWalkTo: (unitId: string) => void;
}

/** Google Maps search for this shop inside the mall: where its public reviews live. */
function reviewsUrl(space: DirectorySpace): string {
  const query = `${space.name} ${MALL_NAME} Putrajaya`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function TenantPanel({ space, onClose, onWalkTo }: TenantPanelProps) {
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const banner = !photoFailed ? (space.photo ?? null) : null;

  return (
    <div className="tenant-detail-layout">
      <aside className="side-panel tenant-profile" aria-label={space.name}>
        <button type="button" className="icon-button tenant-profile-close" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
        <div className="tenant-profile-scroll">
          {banner ? (
            <div className="tenant-gallery banner tenant-profile-banner">
              <div className="tenant-gallery-image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={banner.src} alt={`${space.name} storefront`} onError={() => setPhotoFailed(true)} />
              </div>
            </div>
          ) : space.logo ? (
            <div className="tenant-profile-banner tenant-profile-logo-banner">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={space.logo.src} alt={`${space.name} logo`} width={space.logo.w} height={space.logo.h} />
            </div>
          ) : (
            <div className="tenant-profile-banner tenant-profile-banner-empty">No photo yet</div>
          )}

          <div className="tenant-profile-heading">
            <span className="unit-badge">{space.unitNumber}</span>
            <h1>{space.name}</h1>
            <p className="tenant-profile-category">
              {space.category} · {space.floorLabel}
            </p>
          </div>

          {space.description && (
            <section className="tenant-profile-section">
              <h2>About</h2>
              {space.description.split("\n\n").map((paragraph) => (
                <p key={paragraph.slice(0, 40)}>{paragraph}</p>
              ))}
            </section>
          )}

          {space.hours && (
            <section className="tenant-profile-section">
              <h2>Opening hours</h2>
              <p>{space.hours}</p>
            </section>
          )}

          <section className="tenant-profile-section">
            <h2>Reviews</h2>
            <p className="tenant-profile-empty">
              The mall’s directory doesn’t publish ratings. Read what visitors say on Google Maps.
            </p>
            <div className="tenant-profile-links tenant-profile-reviews">
              <a href={reviewsUrl(space)} target="_blank" rel="noopener noreferrer">
                Reviews on Google Maps
                <Icon name="external" size={14} />
              </a>
            </div>
          </section>

          <section className="tenant-profile-section">
            <h2>Visit</h2>
            <div className="tenant-profile-links">
              <button type="button" className="tenant-profile-walk" onClick={() => onWalkTo(space.unitId)}>
                Walk me there
                <Icon name="walk" size={14} />
              </button>
              {space.website && (
                <a href={space.website} target="_blank" rel="noopener noreferrer">
                  {displayHost(space.website)}
                  <Icon name="external" size={14} />
                </a>
              )}
              {space.phone && (
                <a href={`tel:${space.phone.replace(/[^\d+]/g, "")}`}>
                  {space.phone}
                  <Icon name="arrow" size={14} />
                </a>
              )}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
