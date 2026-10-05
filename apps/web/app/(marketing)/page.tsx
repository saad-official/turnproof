import { existsSync } from "node:fs";
import path from "node:path";
import { BadgeCheck, Camera, Clock3, LayoutGrid, Link2, Lock, ShieldCheck, Timer, WifiOff } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChecklistScreen, LiveActivityStrip, OfflineMock, PhoneFrame, StampMock, WidgetMock } from "@/components/marketing/device-mocks";
import { FAQ, STEPS } from "@/lib/marketing/content";

/** The hero shows the product video only when the file ships with the build; otherwise the CSS mock. */
const HERO_VIDEO = "/video/turnproof.mp4";
const hasHeroVideo = existsSync(path.join(process.cwd(), "public", HERO_VIDEO));

function Section({ id, eyebrow, title, intro, children }: { id: string; eyebrow?: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mx-auto max-w-6xl scroll-mt-8 px-4 pt-24 sm:px-8">
      {eyebrow ? <p className="text-callout font-semibold text-accent-ink">{eyebrow}</p> : null}
      <h2 id={`${id}-title`} className="mt-1 max-w-2xl text-title font-bold sm:text-display">
        {title}
      </h2>
      {intro ? <div className="mt-4 max-w-2xl text-body text-ink-2">{intro}</div> : null}
      <div className="mt-10">{children}</div>
    </section>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden" aria-labelledby="hero-title">
      <div aria-hidden className="linen pointer-events-none absolute inset-y-0 right-0 hidden w-[46%] rounded-bl-[64px] lg:block" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-8 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-callout font-semibold text-accent-ink">
            <ShieldCheck aria-hidden className="size-4" />
            For solo cleaners and small hosts
          </p>
          <h1 id="hero-title" className="mt-5 max-w-[14ch] text-[44px] leading-[1.05] font-bold tracking-[-0.02em] sm:text-[60px]">
            Proof that the turnover happened. Free.
          </h1>
          <p className="mt-6 max-w-xl text-[19px] leading-[29px] text-ink-2">
            A room-by-room checklist with before and after photos taken in the app and stamped with the time and place.
            When you finish, send the host a link that shows exactly what you did. No paper checklist, no digging through
            a camera roll when someone says it wasn&apos;t clean.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/example"
              className="inline-flex h-12 items-center rounded-full bg-accent px-6 text-body font-semibold text-on-accent transition-colors hover:bg-accent-pressed"
            >
              See an example proof page
            </Link>
            <Link
              href="#how"
              className="inline-flex h-12 items-center rounded-full px-5 text-body font-semibold text-accent-ink ring-1 ring-edge transition-colors hover:bg-elevated"
            >
              How it works
            </Link>
          </div>
          <p className="mt-6 text-callout text-ink-2">In testing for iPhone and Android. No subscription, no ads, no limits.</p>
        </div>

        <figure className="relative mx-auto flex flex-col items-center lg:h-[660px] lg:w-full lg:items-end">
          <figcaption className="sr-only">
            The Turnproof turnover screen for the bathroom at Maple St, room 3 of 6: a before and an after photo, both
            verified captures, three of five checklist items ticked, and Issue and Next room buttons. Below it, the Lock
            Screen Live Activity reads “Maple St · Bathroom 3/6 · 42 min”.
          </figcaption>
          {hasHeroVideo ? (
            <video
              className="w-[310px] rounded-[40px] shadow-lg"
              src={HERO_VIDEO}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-hidden
            />
          ) : (
            <>
              <div aria-hidden className="lg:mr-10">
                <PhoneFrame>
                  <ChecklistScreen />
                </PhoneFrame>
              </div>
              <div aria-hidden className="relative -mt-16 w-full max-w-[330px] lg:absolute lg:bottom-6 lg:left-0 lg:mt-0">
                <LiveActivityStrip />
              </div>
            </>
          )}
        </figure>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <Section
      id="how"
      eyebrow="How it works"
      title="One turnover, start to link"
      intro="Set a property up once: its rooms, what to check in each, what to restock, the lockbox code. Then every turnover goes like this."
    >
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="rounded-lg border border-line bg-elevated p-6 shadow-sm">
            <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-callout font-bold text-accent-ink tabular">
              {index + 1}
            </span>
            <h3 className="mt-4 text-headline font-semibold">{step.title}</h3>
            <p className="mt-2 text-callout text-ink-2">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Feature({ icon, title, children, mock }: { icon: ReactNode; title: string; children: ReactNode; mock: ReactNode }) {
  return (
    <li className="grid gap-6 border-t border-line py-10 md:grid-cols-[1fr_auto] md:items-center md:gap-16">
      <div className="max-w-xl">
        <h3 className="flex items-center gap-3 text-headline font-semibold">
          <span className="text-accent-ink">{icon}</span>
          {title}
        </h3>
        <div className="mt-3 text-body text-ink-2">{children}</div>
      </div>
      <div aria-hidden className="flex justify-start md:w-[340px] md:justify-center">
        {mock}
      </div>
    </li>
  );
}

function NativeFeatures() {
  return (
    <Section
      id="features"
      eyebrow="On your phone"
      title="Made for the job, not for the office"
      intro="Gloves on, one hand free, a basement with no signal. Turnproof is built around the camera and the Lock Screen."
    >
      <ul>
        <Feature icon={<Camera aria-hidden className="size-6" />} title="Camera-only proof, stamped at the shutter" mock={<StampMock />}>
          <p>
            Proof photos can only come from the Turnproof camera. Each one records the time, the phone model, a rough
            location if you allow it, and a SHA-256 fingerprint of the file. Imports from the camera roll are allowed,
            but they are labelled “Reference photo” and never count as proof.
          </p>
        </Feature>
        <Feature icon={<Timer aria-hidden className="size-6" />} title="The turnover on your Lock Screen" mock={<LiveActivityStrip />}>
          <p>
            A Live Activity on iPhone (and a Live Update on Android 16) shows the property, the room you&apos;re in, rooms
            done and the time so far, with Next room and Issue buttons, so you rarely have to unlock.
          </p>
        </Feature>
        <Feature icon={<LayoutGrid aria-hidden className="size-6" />} title="Widgets for the day" mock={<WidgetMock />}>
          <p>
            The next turnover with a countdown to checkout, today&apos;s list, and a Lock Screen ring for rooms done.
            Reminders arrive before checkout time, and late turnovers get an overdue badge.
          </p>
        </Feature>
        <Feature icon={<WifiOff aria-hidden className="size-6" />} title="Works offline" mock={<OfflineMock />}>
          <p>
            Everything is saved on the phone first. Checklists, photos, stamps and the timer work without a signal;
            sharing waits until you are back online.
          </p>
        </Feature>
      </ul>
      <p className="mt-2 text-body text-ink-2">
        Also included: history per property and month, CSV export of turnovers, a PDF of any single turnover, and an
        invite code so a host and their cleaner see the same schedule.
      </p>
    </Section>
  );
}

function ProofLink() {
  return (
    <Section
      id="proof"
      eyebrow="The proof link"
      title="What the host sees"
      intro="One private page per turnover, made when you choose to share it. It opens in any browser and needs no account."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-line bg-elevated p-6 shadow-sm">
          <Link2 aria-hidden className="size-6 text-accent-ink" />
          <h3 className="mt-4 text-headline font-semibold">The page</h3>
          <p className="mt-2 text-callout text-ink-2">
            The property name (never the address or lockbox code), the date, how long it took, and every room with its
            before and after photos side by side, the checklist, and any issues with their photos. It never shows your
            account, email or phone number.
          </p>
          <Link href="/example" className="mt-4 inline-block text-callout font-semibold text-accent-ink underline">
            Open the example
          </Link>
        </div>
        <div className="rounded-lg border border-line bg-elevated p-6 shadow-sm">
          <BadgeCheck aria-hidden className="size-6 text-verified-ink" />
          <h3 className="mt-4 text-headline font-semibold">How verification works</h3>
          <p className="mt-2 text-callout text-ink-2">
            A photo gets the “Verified capture” badge only if all three hold: it was taken with the Turnproof camera, its
            time falls within the turnover (with ten minutes either side for clock drift), and the file the server
            received has exactly the fingerprint the phone recorded when the shutter fired. Edit the photo and the
            fingerprint no longer matches.
          </p>
        </div>
        <div className="rounded-lg border border-line bg-elevated p-6 shadow-sm">
          <Clock3 aria-hidden className="size-6 text-accent-ink" />
          <h3 className="mt-4 text-headline font-semibold">Expiry and withdrawal</h3>
          <p className="mt-2 text-callout text-ink-2">
            Links expire after 60 days. You (or the host, if they share the property with you) can withdraw a link at
            any time, and the page stops working straight away. Proof pages are hidden from search engines.
          </p>
        </div>
      </div>
    </Section>
  );
}

function Policy() {
  return (
    <Section
      id="policy"
      eyebrow="Why it matters"
      title="Evidence that holds up, filed in time"
      intro={
        <>
          <p>
            “It wasn&apos;t clean” and “that was already broken” are settled with photos: dated, from the right room,
            taken during the turnover. Booking platforms are getting stricter about what counts.
          </p>
        </>
      }
    >
      <ul className="grid gap-4 md:grid-cols-2">
        <li className="rounded-lg bg-sunken p-6">
          <h3 className="text-headline font-semibold">Unverifiable evidence can be turned down</h3>
          <p className="mt-2 text-callout text-ink-2">
            Airbnb&apos;s 2026 damage policy (section 3.3.3) says it may deny evidence that appears AI-generated or
            can&apos;t be verified. Camera-only capture with a recorded fingerprint and capture time is meant for exactly
            that question.
          </p>
        </li>
        <li className="rounded-lg bg-sunken p-6">
          <h3 className="text-headline font-semibold">The clock starts at checkout</h3>
          <p className="mt-2 text-callout text-ink-2">
            AirCover damage claims have to be filed within 14 days of checkout. A proof link exists the minute you
            finish, not after someone has gone looking for photos.
          </p>
        </li>
      </ul>
      <p className="mt-4 max-w-3xl text-caption text-ink-2">
        Turnproof isn&apos;t affiliated with Airbnb and can&apos;t promise the outcome of any claim. Check the current
        policy text on the platform you use.
      </p>
    </Section>
  );
}

function WhyFree() {
  return (
    <Section id="free" eyebrow="Why free" title="The cleaner's side of the job had no tool">
      <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4 text-body text-ink-2">
          <p>
            Turnover software exists, but it is built for hosts and property managers who schedule cleaners: Turno
            charges from $10 per feature per month, and TurnFlow is $79 a month. Those are hosts&apos; tools. The person
            doing the turnover usually has a paper checklist and a camera roll.
          </p>
          <p>
            Turnproof is the cleaner&apos;s tool, and it is free: no subscription, no ads, nothing to buy. It can be,
            because the work happens on your phone. Photos only leave it when you share a proof link, and uploaded
            copies are deleted after the link ends, so running it costs very little.
          </p>
        </div>
        <ul className="space-y-3 text-callout">
          {[
            "Unlimited properties, rooms and turnovers",
            "Camera-stamped photos and proof links",
            "Live Activity, widgets, reminders",
            "History, CSV and PDF export",
            "Shared properties by invite code",
          ].map((item) => (
            <li key={item} className="flex items-center gap-3 rounded-md bg-elevated px-4 py-3 shadow-sm">
              <Lock aria-hidden className="size-4 shrink-0 text-accent-ink" />
              <span>{item}</span>
              <span className="ml-auto font-semibold text-accent-ink">Free</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function Faq() {
  return (
    <Section id="faq" eyebrow="Questions" title="Frequently asked">
      <div className="max-w-3xl divide-y divide-line border-y border-line">
        {FAQ.map((item) => (
          <details key={item.q} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-headline font-semibold">
              {item.q}
              <span aria-hidden className="text-ink-3 transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-body text-ink-2">{item.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <NativeFeatures />
      <ProofLink />
      <Policy />
      <WhyFree />
      <Faq />
    </>
  );
}
