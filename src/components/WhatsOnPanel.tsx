"use client";

import { useMemo } from "react";
import { Icon } from "@/components/icons";
import { SpaceArt } from "@/components/SpaceArt";
import { useNow } from "@/hooks/useNow";
import { floorTitle } from "@/lib/mall";
import {
  DIRECTORY_RELEASED,
  DIRECTORY_VERSION,
  announcements,
  comingSoonSpaces,
  findSpace,
  liveOffers,
  mallOpenStatus,
  offerEnds,
  recentChanges,
  shortDate,
  type MallOffer,
} from "@/lib/whats-on";
import type { FloorId } from "@/types/mall";

interface WhatsOnPanelProps {
  floor: FloorId;
  /** Go to a shop: walks there, riding to its level first when it's on another floor. */
  onVisit: (floor: FloorId, unitId: string) => void;
  onClose: () => void;
}

const CHANGE_LABEL = { new: "New", opened: "Now open" } as const;

function OfferCard({ offer, now, onVisit }: { offer: MallOffer; now: number; onVisit: WhatsOnPanelProps["onVisit"] }) {
  const shop = offer.shops[0];
  const space = shop ? findSpace(shop.floor, shop.unitId) : null;
  const ends = offerEnds(offer, now);
  const body = (
    <>
      {offer.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="whats-on-offer-image" src={offer.image.src} alt="" width={offer.image.w} height={offer.image.h} loading="lazy" />
      ) : (
        <span className="whats-on-offer-image whats-on-offer-image-empty" aria-hidden>
          <Icon name="sparkle" size={20} />
        </span>
      )}
      <span className="whats-on-offer-text">
        <strong>{offer.title}</strong>
        {offer.description && <span>{offer.description.split("\n\n")[0]}</span>}
        <small>
          {space ? `${space.name} · ${floorTitle(shop.floor)}` : "Around the mall"}
          {ends && <em>{ends}</em>}
        </small>
      </span>
    </>
  );
  return space ? (
    <button type="button" className="whats-on-offer" onClick={() => onVisit(shop.floor, shop.unitId)} aria-label={`${offer.title}, at ${space.name}. Walk there`}>
      {body}
    </button>
  ) : (
    <div className="whats-on-offer">{body}</div>
  );
}

/**
 * "What's on": the mall's opening status, shops that opened recently, offers running today, units
 * being fitted out and attractions, all from the daily directory sync.
 */
export function WhatsOnPanel({ floor, onVisit, onClose }: WhatsOnPanelProps) {
  const now = useNow();
  const status = now === null ? null : mallOpenStatus(now);
  const offers = useMemo(() => (now === null ? [] : liveOffers(now)), [now]);
  const changes = useMemo(() => (now === null ? [] : recentChanges(now)), [now]);
  const fresh = changes.filter((change) => (change.type === "new" || change.type === "opened") && change.unitId && change.floor);
  const closed = changes.filter((change) => change.type === "closed");

  return (
    <aside className="side-panel whats-on-panel" aria-label="What's on">
      <div className="panel-top">
        <span className="eyebrow">IOI CITY MALL{DIRECTORY_RELEASED ? ` · UPDATED ${shortDate(DIRECTORY_RELEASED).toUpperCase()}` : ""}</span>
        <button className="icon-button" aria-label="Close what's on" onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="panel-heading">
        <h1>What’s on</h1>
        {status && (
          <p className="whats-on-status" data-open={status.open}>
            <span aria-hidden />
            {status.label}
            {status.usual && <small>Daily {status.usual}</small>}
          </p>
        )}
      </div>

      <div className="whats-on-body">
        {fresh.length > 0 && (
          <section className="whats-on-section">
            <h2>New at the mall</h2>
            {fresh.map((change) => {
              const space = findSpace(change.floor as FloorId, change.unitId as string);
              if (!space) return null;
              const spaceFloor = change.floor as FloorId;
              return (
                <button
                  type="button"
                  className="directory-item"
                  key={`${change.type}-${change.unitId}`}
                  onClick={() => onVisit(spaceFloor, space.unitId)}
                  aria-label={`Go to ${space.name}, ${floorTitle(spaceFloor)}, unit ${space.unitNumber}`}
                >
                  <SpaceArt space={space} className="thumb" />
                  <span className="item-text">
                    <strong>{space.name}</strong>
                    <span>{space.category}</span>
                    <small>
                      {space.unitNumber}
                      <span className="status-badge" data-kind="new">
                        {CHANGE_LABEL[change.type as keyof typeof CHANGE_LABEL]}
                      </span>
                      {spaceFloor !== floor && <span className="floor-badge">{floorTitle(spaceFloor)}</span>}
                    </small>
                  </span>
                  <Icon name={spaceFloor === floor ? "walk" : "layers"} size={16} />
                </button>
              );
            })}
          </section>
        )}

        {offers.length > 0 && (
          <section className="whats-on-section">
            <h2>
              Offers <small>{offers.length}</small>
            </h2>
            <p className="whats-on-note">CLUB IOI member deals running today.</p>
            {now !== null && offers.map((offer) => <OfferCard key={offer.id} offer={offer} now={now} onVisit={onVisit} />)}
          </section>
        )}

        {comingSoonSpaces.length > 0 && (
          <section className="whats-on-section">
            <h2>
              Coming soon <small>{comingSoonSpaces.length}</small>
            </h2>
            {comingSoonSpaces.map(({ space, floor: spaceFloor }) => (
              <button
                type="button"
                className="directory-item"
                key={space.unitId}
                onClick={() => onVisit(spaceFloor, space.unitId)}
                aria-label={`Go to ${space.name}, coming soon, ${floorTitle(spaceFloor)}`}
              >
                <SpaceArt space={space} className="thumb" />
                <span className="item-text">
                  <strong>{space.name}</strong>
                  <span>{space.category === "Opening soon" ? "Being fitted out" : space.category}</span>
                  <small>
                    {/_\d/.test(space.unitNumber) ? "" : space.unitNumber}
                    <span className="status-badge" data-kind="soon">
                      Coming soon
                    </span>
                    {spaceFloor !== floor && <span className="floor-badge">{floorTitle(spaceFloor)}</span>}
                  </small>
                </span>
                <Icon name={spaceFloor === floor ? "walk" : "layers"} size={16} />
              </button>
            ))}
          </section>
        )}

        {announcements.length > 0 && (
          <section className="whats-on-section">
            <h2>Around the mall</h2>
            <div className="whats-on-attractions">
              {announcements.map((item) => (
                <article className="whats-on-attraction" key={item.id}>
                  {item.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image.src} alt="" width={item.image.w} height={item.image.h} loading="lazy" />
                  )}
                  <h3>{item.title}</h3>
                  {item.description && <p>{item.description.split("\n\n")[0]}</p>}
                  {item.link && (
                    <a href={item.link} target="_blank" rel="noopener noreferrer">
                      Tickets &amp; info
                      <Icon name="external" size={12} />
                    </a>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {closed.length > 0 && (
          <section className="whats-on-section">
            <h2>Recently closed</h2>
            <ul className="whats-on-closed">
              {closed.map((change) => (
                <li key={change.name}>
                  {change.name}
                  {change.floor && <small>{floorTitle(change.floor)}</small>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="whats-on-source">From IOI City Mall’s own directory (release {DIRECTORY_VERSION}), checked every morning.</p>
      </div>
    </aside>
  );
}
