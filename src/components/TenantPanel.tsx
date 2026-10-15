"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { useNow } from "@/hooks/useNow";
import { MALL_NAME } from "@/lib/mall";
import { mallOpenStatus, newUnitIds, offerEnds, offersForUnit } from "@/lib/whats-on";
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
  const now = useNow();
  const offers = now === null ? [] : offersForUnit(space.unitId, now);
  const isNew = now !== null && !space.comingSoon && newUnitIds(now).has(space.unitId);
  // Shops keep the mall's hours unless the directory says otherwise.
  const mallStatus = now === null || space.comingSoon ? null : mallOpenStatus(now);

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
            {space.comingSoon && <span className="status-badge" data-kind="soon">Coming soon</span>}
            {isNew && <span className="status-badge" data-kind="new">New</span>}
            <h1>{space.name}</h1>
            <p className="tenant-profile-category">
              {space.category} · {space.floorLabel}
            </p>
          </div>

          {space.comingSoon && (
            <section className="tenant-profile-section">
              <p className="tenant-profile-soon">
                This unit is being fitted out behind hoarding. The mall lists it as opening soon. Check back
                here, the directory refreshes every morning.
              </p>
            </section>
          )}

          {offers.length > 0 && now !== null && (
            <section className="tenant-profile-section">
              <h2>Offers</h2>
              {offers.map((offer) => (
                <div className="tenant-profile-offer" key={offer.id}>
                  <strong>{offer.title}</strong>
                  {offer.description && <p>{offer.description}</p>}
                  {offerEnds(offer, now) && <small>{offerEnds(offer, now)} · CLUB IOI members</small>}
                </div>
              ))}
            </section>
          )}

          {space.description && (
            <section className="tenant-profile-section">
              <h2>About</h2>
              {space.description.split("\n\n").map((paragraph) => (
                <p key={paragraph.slice(0, 40)}>{paragraph}</p>
              ))}
            </section>
          )}

          {(space.hours || mallStatus) && (
            <section className="tenant-profile-section">
              <h2>Opening hours</h2>
              {mallStatus && (
                <p className="whats-on-status" data-open={mallStatus.open}>
                  <span aria-hidden />
                  {mallStatus.label}
                </p>
              )}
              {space.hours && <p>{space.hours}</p>}
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
