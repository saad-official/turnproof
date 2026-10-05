import type { Metadata } from "next";
import { SUPPORT_EMAIL } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The terms for using Turnproof, a free turnover checklist and photo proof app.",
};

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-6xl px-4 pt-12 sm:px-8">
      <h1 className="text-display font-bold">Terms of use</h1>
      <p className="mt-2 text-callout text-ink-2">Last updated 6 October 2026</p>
      <div className="prose-doc mt-8">
        <p>By using the Turnproof app or website you agree to these terms. They are short on purpose.</p>

        <h2>The service</h2>
        <p>
          Turnproof is free. There are no purchases, subscriptions or ads. We may change or stop the service; if we
          stop it, we will say so in the app first, so you can export what you need.
        </p>

        <h2>Your content</h2>
        <p>
          Your properties, checklists and photos are yours. You give us permission to store and show them only as
          needed to run the features you use: syncing with the people you share a property with, and the proof links
          you publish. Only photograph properties you are allowed to be in, and don&apos;t photograph guests.
        </p>

        <h2>Proof links and evidence</h2>
        <p>
          A proof link shows what the app recorded: capture times, optional rounded locations, and whether each photo
          passed its checks. It is a record, not a guarantee. We do not decide disputes and cannot promise how a booking
          platform, insurer or court will treat it. Turnproof is not affiliated with Airbnb or any booking platform.
        </p>

        <h2>Fair use</h2>
        <p>
          Don&apos;t use Turnproof to break the law, to mislead anyone about the state of a property, to upload anything
          you have no right to share, or to probe, overload or work around the service&apos;s limits and checks.
        </p>

        <h2>No warranty</h2>
        <p>
          Turnproof is provided as is. Keep your own copies of anything important (the app exports CSV and PDF). To
          the extent the law allows, we are not liable for indirect losses or for lost data.
        </p>

        <h2>Contact</h2>
        <p>
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </p>
      </div>
    </article>
  );
}
