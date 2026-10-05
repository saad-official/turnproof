import { AlertTriangle, BadgeCheck, Camera, Check, ChevronRight, Clock, WifiOff } from "lucide-react";
import type { ReactNode } from "react";

/**
 * CSS drawings of the app for the landing page. Decorative (aria-hidden at
 * the call site, described in a figcaption), built only from tokens, with the
 * drawn sample photos from /public/samples.
 */

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative w-[290px] rounded-[46px] border border-edge bg-ink p-2.5 shadow-lg sm:w-[310px]">
      <div className="relative overflow-hidden rounded-[38px] bg-surface">
        <div className="absolute top-2.5 left-1/2 z-10 h-6 w-24 -translate-x-1/2 rounded-full bg-ink" />
        {children}
      </div>
    </div>
  );
}

function SampleTile({ src, label, verified = true }: { src: string; label: string; verified?: boolean }) {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-elevated shadow-sm">
      <div className="aspect-[4/3] bg-cover bg-center" style={{ backgroundImage: `url(${src})` }} />
      <div className="flex items-center justify-between gap-1 px-2 py-1.5">
        <span className="text-[11px] font-semibold text-ink-2">{label}</span>
        {verified ? <BadgeCheck className="size-3.5 text-verified" /> : null}
      </div>
    </div>
  );
}

const ITEMS = [
  { label: "Scrub shower and glass", done: true },
  { label: "Toilet, inside and out", done: true },
  { label: "Fresh towels ×4", done: true },
  { label: "Restock toilet paper", done: false },
  { label: "Mop floor", done: false },
];

/** The turnover flow: Maple St, bathroom, room 3 of 6. */
export function ChecklistScreen() {
  return (
    <div className="px-4 pt-12 pb-5">
      <div className="flex items-center justify-between text-caption text-ink-2">
        <span>Maple St</span>
        <span className="inline-flex items-center gap-1 tabular">
          <Clock className="size-3.5" />
          42 min
        </span>
      </div>
      <h3 className="mt-1 text-title font-bold">Bathroom</h3>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
          <div className="h-full w-1/2 rounded-full bg-accent" />
        </div>
        <span className="text-caption font-semibold text-ink-2 tabular">Room 3 of 6</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <SampleTile src="/samples/bathroom-before.svg" label="Before · 10:18" />
        <SampleTile src="/samples/bathroom-after.svg" label="After · 10:39" />
      </div>
      <ul className="mt-4 space-y-1.5">
        {ITEMS.map((item) => (
          <li key={item.label} className="flex items-center gap-2.5 rounded-sm bg-elevated px-3 py-2 text-callout shadow-sm">
            <span
              className={`grid size-5 shrink-0 place-items-center rounded-full ${
                item.done ? "bg-accent text-on-accent" : "border-2 border-edge"
              }`}
            >
              {item.done ? <Check className="size-3.5" strokeWidth={3} /> : null}
            </span>
            <span className={item.done ? "text-ink-2 line-through decoration-ink-3" : ""}>{item.label}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
        <span className="inline-flex h-11 items-center gap-1.5 rounded-full bg-issue-soft px-4 text-callout font-semibold text-issue-ink">
          <AlertTriangle className="size-4" />
          Issue
        </span>
        <span className="inline-flex h-11 items-center justify-center gap-1 rounded-full bg-accent text-callout font-semibold text-on-accent">
          Next room
          <ChevronRight className="size-4" />
        </span>
      </div>
    </div>
  );
}

/** The Lock Screen Live Activity for the running turnover. Always drawn dark, like a Lock Screen. */
export function LiveActivityStrip() {
  return (
    <div data-scheme="dark" className="rounded-[26px] bg-elevated p-4 text-ink shadow-lg ring-1 ring-edge">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
          <Camera className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-callout font-semibold">Maple St · Bathroom 3/6 · 42 min</p>
          <div className="mt-1.5 flex gap-1">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= 2 ? "bg-accent" : n === 3 ? "bg-accent/60" : "bg-sunken"}`} />
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-callout font-semibold">
        <span className="rounded-full bg-sunken py-2 text-center">Issue</span>
        <span className="rounded-full bg-accent py-2 text-center text-on-accent">Next room</span>
      </div>
    </div>
  );
}

/** Home Screen widget: the next turnover. */
export function WidgetMock() {
  return (
    <div className="w-[170px] rounded-[24px] bg-elevated p-4 shadow-md ring-1 ring-line">
      <p className="text-caption font-semibold text-accent-ink">Next turnover</p>
      <p className="mt-1 text-headline font-bold">Maple St</p>
      <p className="text-callout text-ink-2">Checkout 11:00</p>
      <p className="mt-3 text-title font-bold tabular">1 h 20</p>
      <p className="text-caption text-ink-2">2 more today</p>
    </div>
  );
}

/** A stamped photo with its chip, as the camera shows it. */
export function StampMock() {
  return (
    <div className="w-[260px] overflow-hidden rounded-lg bg-elevated shadow-md ring-1 ring-line">
      <div className="relative aspect-[4/3] bg-cover bg-center" style={{ backgroundImage: "url(/samples/kitchen-after.svg)" }}>
        <span
          data-scheme="dark"
          className="absolute right-2 bottom-2 left-2 rounded-sm bg-surface/85 px-2 py-1 text-[11px] leading-4 text-ink tabular"
        >
          Tue 6 Oct, 10:52 · 43.65, −79.38 (±8 m) · Pixel 9
        </span>
      </div>
      <div className="flex items-center gap-1.5 px-3 py-2 text-caption font-semibold text-verified-ink">
        <BadgeCheck className="size-4" />
        Camera capture · sha256 recorded
      </div>
    </div>
  );
}

export function OfflineMock() {
  return (
    <div className="flex w-[260px] items-center gap-3 rounded-lg bg-elevated p-4 shadow-md ring-1 ring-line">
      <span className="grid size-10 place-items-center rounded-full bg-sunken text-ink-2">
        <WifiOff className="size-5" />
      </span>
      <div>
        <p className="text-callout font-semibold">No signal in the basement</p>
        <p className="text-caption text-ink-2">12 photos saved on the phone. Syncs when you are back online.</p>
      </div>
    </div>
  );
}
