import type { Metadata } from "next";
import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: "Support",
  description: "Help with Turnproof: proof links, verification badges, sharing a property, and deleting your data.",
};

const TOPICS = [
  {
    q: "A photo on my proof link says “Not verified”",
    a: "The badge needs three things: the photo was taken with the Turnproof camera, during the turnover (ten minutes either side is allowed), and the uploaded file matches the fingerprint recorded at capture. The reason is printed under the photo. A common cause is a phone clock that is far off; set it to automatic and the next turnover will verify.",
  },
  {
    q: "Publishing says some photos are missing",
    a: "Every photo of the turnover has to upload before the link is made. Stay online for a moment and tap Share again; the app uploads what is left and then publishes.",
  },
  {
    q: "The host says the link doesn't open",
    a: "Links expire after 60 days and can be withdrawn. Open the turnover in the app to see the link's state, and share a new one if needed.",
  },
  {
    q: "Sharing a property with a host or cleaner",
    a: "The person who created the property finds its invite code under the property's sharing settings. The other person enters it in the app after signing in. The owner can remove people; anyone else can leave.",
  },
  {
    q: "Deleting my data",
    a: "Delete your account in the app's Settings. Your account, the properties you own (with their turnovers, photos and links), memberships and devices are removed from the server. Data on your phone stays until you delete the app.",
  },
] as const;

export default function SupportPage() {
  return (
    <article className="mx-auto max-w-6xl px-4 pt-12 sm:px-8">
      <h1 className="text-display font-bold">Support</h1>
      <div className="prose-doc mt-6">
        <p>
          Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and a person will answer, usually within two
          working days. Please include your phone model and, for a proof link problem, the link itself.
        </p>
        <p>
          Never send passwords or lockbox codes by email. See also the <Link href="/privacy">privacy policy</Link> and
          the <Link href="/example">example proof page</Link>.
        </p>
        {TOPICS.map((topic) => (
          <section key={topic.q}>
            <h2>{topic.q}</h2>
            <p>{topic.a}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
