import type { Metadata } from "next";
import { SUPPORT_EMAIL } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What Turnproof keeps on your phone, what reaches our server and when, and how to export or delete it.",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-6xl px-4 pt-12 sm:px-8">
      <h1 className="text-display font-bold">Privacy policy</h1>
      <p className="mt-2 text-callout text-ink-2">Last updated 6 October 2026</p>
      <div className="prose-doc mt-8">
        <p>
          Turnproof is a free turnover checklist with photo proof. It is built so that your work stays on your phone
          unless you choose to share it. This page explains exactly what is stored where.
        </p>

        <h2>On your phone</h2>
        <p>
          Properties, rooms, checklists, turnovers, issues and photos are stored on your phone. You can use Turnproof
          without an account; then nothing leaves the phone at all.
        </p>

        <h2>Photo stamps</h2>
        <p>Every photo taken with the Turnproof camera gets a stamp:</p>
        <ul>
          <li>the time it was taken and the phone model;</li>
          <li>
            <strong>optionally, a location</strong>: one location fix per photo, only if you allow location access, and you
            can turn it off in Settings. Proof pages show it rounded to about a kilometre;
          </li>
          <li>a SHA-256 fingerprint of the photo file, so anyone can tell whether it was changed.</li>
        </ul>
        <p>
          Before a photo is uploaded, the app resizes it and strips the camera&apos;s own metadata (EXIF), so the only
          details attached are the ones in the stamp above.
        </p>

        <h2>If you sign in</h2>
        <p>
          Signing in with an email address and password lets you share properties with a host or cleaner and publish
          proof links. Then our server stores your name, email address and a hashed password; the properties you create
          or join (name, address, rooms, checklists, access notes) so the people you share them with see the same
          thing; and the turnover records, issues and photo stamps for those properties. People who share a property see
          its turnovers. If you allow notifications, your phone&apos;s push token is stored so Turnproof can notify you
          about your turnovers.
        </p>

        <h2>Photos are uploaded only when you publish a proof link</h2>
        <p>
          Photo files are not uploaded when you sync. They are uploaded when you publish a proof link for a turnover,
          and only that turnover&apos;s photos. The server stores them exactly as received and checks them against their
          fingerprints.
        </p>
        <ul>
          <li>
            <strong>Proof links expire</strong> after 60 days, and you (or anyone you share the property with) can
            withdraw one at any time. From then on the page and its photos are no longer served.
          </li>
          <li>Uploaded copies are deleted about a week after a link expires or is withdrawn.</li>
          <li>
            A proof page shows the property name, the date and time, the rooms, checklist, photos with their stamps and
            the issues. It does not show the address, access notes, invite code, or your name, email or phone number.
          </li>
          <li>Proof pages are marked so that search engines do not index them.</li>
        </ul>

        <h2>Where it is stored</h2>
        <p>
          The website and API run on Vercel. Account and sync data is stored in a Postgres database (Neon); uploaded
          photos in Vercel Blob storage. The website sets no tracking cookies (the only cookie is the sign-in session),
          and there is no advertising anywhere.
        </p>

        <h2>Export and delete</h2>
        <ul>
          <li>Export your turnovers as CSV, or any single turnover as a PDF, from the app.</li>
          <li>
            Delete a turnover in the app and the server marks it deleted at once: its proof link stops working and its
            uploaded photos are removed within 30 days.
          </li>
          <li>
            A property&apos;s owner can delete it for everyone who shares it: its turnovers, photos and proof links are
            removed from the server straight away.
          </li>
          <li>
            Delete your account in Settings: your account, the properties you own with their turnovers, photos and
            proof links, your memberships and your devices are deleted from the server. What is on your phone stays
            until you delete the app.
          </li>
        </ul>

        <h2>What we don&apos;t do</h2>
        <p>We don&apos;t sell or rent data, show ads, or use your photos for anything other than the proof links you publish.</p>

        <h2>Contact</h2>
        <p>
          Questions or requests: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </div>
    </article>
  );
}
