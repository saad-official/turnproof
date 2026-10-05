import { AlertTriangle, BadgeCheck, Camera, Clock, ImageIcon, MapPin, X } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import type { IssueRef, PhotoRef, ProofModel, ProofRoom } from "@turnproof/shared/report";
import { STAMP_REASON_TEXT } from "@turnproof/shared/stamp";
import { ProofMark } from "@/components/marketing/logo";
import { formatDate, formatDay, formatTime, zoneLabel } from "@/lib/format";

/**
 * The read-only proof page body, shared by `/p/[slug]` (real turnovers) and
 * `/example` (drawn sample). Server-rendered; the only client behaviour is
 * the photo lightbox: native <dialog>s opened by invoker-command buttons,
 * with a tiny inline fallback for browsers without them.
 */

type Props = {
  model: ProofModel;
  timezone: string;
  expiresAt: string;
  /** Marks every heading and photo as sample content (the /example page). */
  sample?: boolean;
};

/** `commandfor` / `command` are not in React's DOM types yet; React passes lowercase unknown attributes through. */
const invoke = (target: string, command: "show-modal" | "close") =>
  ({ commandfor: target, command }) as unknown as Record<string, string>;

/**
 * Fallbacks for browsers without invoker commands or `closedby` (MDN-style
 * feature detection): open/close dialogs from `commandfor` buttons, and close
 * a modal when its backdrop is clicked.
 */
const LIGHTBOX_FALLBACK = `(()=>{var B=HTMLButtonElement.prototype,D=window.HTMLDialogElement&&HTMLDialogElement.prototype;if(!("commandForElement" in B)){document.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("button[commandfor]");if(!b)return;var d=document.getElementById(b.getAttribute("commandfor"));if(!d||!d.showModal)return;var c=b.getAttribute("command");if(c==="show-modal"&&!d.open)d.showModal();else if(c==="close")d.close();});}if(D&&!("closedBy" in D)){document.addEventListener("click",function(e){var d=e.target;if(!(d instanceof HTMLDialogElement)||!d.open)return;var r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();});}})();`;

function Badge({ photo }: { photo: PhotoRef }) {
  if (photo.verified) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-verified-soft px-2.5 py-0.5 text-caption font-semibold text-verified-ink">
        <BadgeCheck aria-hidden className="size-3.5" />
        Verified capture
      </span>
    );
  }
  const label = photo.source === "gallery" ? "Reference photo" : "Not verified";
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sunken px-2.5 py-0.5 text-caption font-semibold text-ink-2">
      <ImageIcon aria-hidden className="size-3.5" />
      {label}
    </span>
  );
}

function reasonText(photo: PhotoRef): string | null {
  if (photo.verified) return null;
  const reasons = photo.reasons.map((r) => STAMP_REASON_TEXT[r]);
  return reasons.length > 0 ? reasons.join(". ") : null;
}

function PhotoTile({ photo, label, sample, eager }: { photo: PhotoRef; label: string; sample?: boolean; eager?: boolean }) {
  const dialogId = `photo-${photo.id}`;
  const alt = `${sample ? "Sample drawing: " : ""}${label}, ${photo.stampLabel}`;
  const why = reasonText(photo);
  return (
    <figure className="overflow-hidden rounded-md border border-line bg-elevated shadow-sm">
      {photo.url ? (
        <button
          type="button"
          {...invoke(dialogId, "show-modal")}
          className="group block w-full cursor-zoom-in"
          aria-label={`Enlarge: ${alt}`}
        >
          <Image
            src={photo.url}
            alt={alt}
            width={photo.width}
            height={photo.height}
            unoptimized
            loading={eager ? "eager" : "lazy"}
            sizes="(min-width: 768px) 360px, 50vw"
            className="aspect-[4/3] w-full object-cover transition-opacity duration-150 group-hover:opacity-90"
          />
        </button>
      ) : (
        <div className="linen grid aspect-[4/3] place-items-center text-callout text-ink-3">Photo not available</div>
      )}
      <figcaption className="space-y-1.5 p-3">
        <Badge photo={photo} />
        <p className="flex items-start gap-1.5 text-caption text-ink-2">
          <Clock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span className="tabular">{photo.stampLabel}</span>
        </p>
        {why ? <p className="text-caption text-ink-3">{why}</p> : null}
      </figcaption>
      {photo.url ? (
        <dialog id={dialogId} closedby="any" aria-label={alt} className="lightbox m-auto">
          <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-2 text-callout">
              <span className="font-semibold">{label}</span>
              <Badge photo={photo} />
            </div>
            <button
              type="button"
              {...invoke(dialogId, "close")}
              className="inline-flex size-10 items-center justify-center rounded-full text-ink-2 hover:bg-sunken hover:text-ink"
              aria-label="Close"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <Image src={photo.url} alt={alt} width={photo.width} height={photo.height} unoptimized loading="lazy" className="mx-auto" />
          <p className="px-4 py-2.5 text-caption text-ink-2 tabular">{photo.stampLabel}</p>
        </dialog>
      ) : null}
    </figure>
  );
}

function PhotoColumn({ title, photos, room, sample, eager }: { title: string; photos: PhotoRef[]; room: string; sample?: boolean; eager?: boolean }) {
  return (
    <div>
      <h4 className="mb-2 text-caption font-semibold tracking-wide text-ink-2 uppercase">{title}</h4>
      {photos.length === 0 ? (
        <p className="linen grid aspect-[4/3] place-items-center rounded-md text-callout text-ink-3">No {title.toLowerCase()} photo</p>
      ) : (
        <div className="space-y-3">
          {photos.map((photo, i) => (
            <PhotoTile
              key={photo.id}
              photo={photo}
              label={`${room}, ${title.toLowerCase()}${photos.length > 1 ? ` ${i + 1}` : ""}`}
              sample={sample}
              eager={eager && i === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const SEVERITY: Record<IssueRef["severity"], string> = { high: "High", medium: "Medium", low: "Low" };

function IssueCard({ issue, room, sample }: { issue: IssueRef; room?: string; sample?: boolean }) {
  return (
    <li className="grid gap-4 rounded-md border border-line bg-elevated p-4 sm:grid-cols-[1fr_220px]">
      <div>
        <p className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-issue-soft px-2.5 py-0.5 text-caption font-semibold text-issue-ink">
            <AlertTriangle aria-hidden className="size-3.5" />
            {SEVERITY[issue.severity]} severity
          </span>
          {room ? <span className="text-callout text-ink-2">{room}</span> : null}
        </p>
        <p className="mt-2 text-body">{issue.note || "No note added."}</p>
      </div>
      {issue.photo ? <PhotoTile photo={issue.photo} label={`Issue${room ? ` in ${room}` : ""}`} sample={sample} /> : null}
    </li>
  );
}

function Room({ room, sample, first }: { room: ProofRoom; sample?: boolean; first?: boolean }) {
  const { checklist } = room;
  return (
    <section aria-labelledby={`room-${room.roomId}`} className="border-t border-line pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id={`room-${room.roomId}`} className="text-headline font-semibold">
          {room.name}
        </h3>
        <p className="text-callout text-ink-2">
          <span className="tabular">
            {checklist.checkedAll} of {checklist.totalAll}
          </span>{" "}
          checklist items {room.complete ? <span className="font-semibold text-accent-ink">· Room done</span> : "· Not finished"}
        </p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-5">
        <PhotoColumn title="Before" photos={room.before} room={room.name} sample={sample} eager={first} />
        <PhotoColumn title="After" photos={room.after} room={room.name} sample={sample} eager={first} />
      </div>
      {checklist.items.length > 0 ? (
        <details className="mt-4 rounded-md bg-sunken px-4 py-3">
          <summary className="cursor-pointer text-callout font-semibold">Checklist</summary>
          <ul className="mt-2 space-y-1 text-callout">
            {checklist.items.map((item) => (
              <li key={item.id} className="flex items-start gap-2">
                <span aria-hidden className={item.checked ? "text-accent-ink" : "text-ink-3"}>
                  {item.checked ? "✓" : "○"}
                </span>
                <span className={item.checked ? "" : "text-ink-2"}>
                  {item.label}
                  {!item.required ? <span className="text-ink-3"> (optional)</span> : null}
                  <span className="sr-only">{item.checked ? ", done" : ", not done"}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {room.references.length > 0 ? (
        <div className="mt-4">
          <h4 className="mb-2 text-caption font-semibold tracking-wide text-ink-2 uppercase">Reference photos</h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {room.references.map((photo) => (
              <PhotoTile key={photo.id} photo={photo} label={`${room.name}, reference`} sample={sample} />
            ))}
          </div>
        </div>
      ) : null}
      {room.issues.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {room.issues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} room={room.name} sample={sample} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-elevated px-4 py-3 shadow-sm">
      <dt className="text-caption text-ink-2">{label}</dt>
      <dd className="mt-0.5 text-headline font-semibold tabular">{value}</dd>
    </div>
  );
}

export function ProofView({ model, timezone, expiresAt, sample }: Props) {
  const { turnover, totals } = model;
  const when = turnover.startedAt ?? turnover.scheduledFor;
  const window =
    turnover.startedAt && turnover.finishedAt
      ? `${formatTime(turnover.startedAt, timezone)}–${formatTime(turnover.finishedAt, timezone)} ${zoneLabel(timezone)}`
      : null;
  return (
    <div className="mx-auto max-w-4xl px-4 pt-8 pb-16 sm:px-8">
      <header>
        <p className="flex items-center gap-2 text-callout font-semibold text-accent-ink">
          <ProofMark className="size-5" />
          {sample ? "Sample turnover proof" : "Turnover proof"}
        </p>
        <h1 className="mt-2 text-display font-bold">{model.property.name}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-body text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <Clock aria-hidden className="size-4" />
            <time dateTime={when}>{formatDate(when, timezone)}</time>
            {window ? <span className="tabular">· {window}</span> : null}
          </span>
          {turnover.durationLabel ? <span>Took {turnover.durationLabel}</span> : null}
        </p>
        {turnover.forced ? (
          <p className="mt-3 rounded-md bg-warning-soft px-4 py-3 text-callout text-warning">
            Finished with some rooms incomplete{turnover.note ? `: ${turnover.note}` : "."}
          </p>
        ) : null}
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Rooms done" value={`${totals.roomsDone} / ${totals.roomsTotal}`} />
          <Stat label="Checklist items" value={`${totals.itemsDone} / ${totals.itemsTotal}`} />
          <Stat label="Verified photos" value={`${totals.verifiedPhotos} / ${totals.photos}`} />
          <Stat label="Issues reported" value={String(totals.issues)} />
        </dl>
      </header>

      <aside className="mt-6 rounded-md border border-line bg-elevated p-4 text-callout text-ink-2">
        <p className="flex items-start gap-2">
          <Camera aria-hidden className="mt-0.5 size-4 shrink-0 text-verified-ink" />
          <span>
            <strong className="font-semibold text-ink">Verified capture</strong> means the photo was taken with the
            Turnproof camera (not imported), during this turnover, and the file on this page is byte-for-byte the one the
            phone fingerprinted when the shutter fired. <strong className="font-semibold text-ink">Reference photos</strong>{" "}
            were imported and are shown for context only.
          </span>
        </p>
        <p className="mt-2 flex items-start gap-2">
          <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>Times and coordinates come from the phone at capture. Locations are rounded; the address is not shown.</span>
        </p>
      </aside>

      <div className="mt-10 space-y-10">
        {model.rooms.map((room, index) => (
          <Room key={room.roomId} room={room} sample={sample} first={index === 0} />
        ))}
      </div>

      {model.generalIssues.length > 0 ? (
        <section aria-labelledby="general-issues" className="mt-10 border-t border-line pt-8">
          <h3 id="general-issues" className="text-headline font-semibold">
            Other issues
          </h3>
          <ul className="mt-4 space-y-3">
            {model.generalIssues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} sample={sample} />
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="mt-16 border-t border-line pt-6 text-callout text-ink-2">
        <p>
          Published with{" "}
          <Link href="/" className="font-semibold text-accent-ink underline">
            Turnproof
          </Link>{" "}
          · expires <time dateTime={expiresAt}>{formatDay(expiresAt, timezone)}</time>
        </p>
        <p className="mt-1 text-caption text-ink-3">
          This page is private to whoever has the link. It is not indexed by search engines and the person who shared it
          can withdraw it at any time.
        </p>
      </footer>
      <script dangerouslySetInnerHTML={{ __html: LIGHTBOX_FALLBACK }} />
    </div>
  );
}
