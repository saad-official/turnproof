import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/marketing/content";
import { Wordmark } from "./logo";

const LINKS = [
  { href: "/example", label: "Example proof page" },
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms of use" },
  { href: "/support", label: "Support" },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-elevated">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-8 md:grid-cols-[1fr_auto]">
        <div className="max-w-xl space-y-4">
          <Wordmark />
          <p className="text-callout text-ink-2">
            A free turnover checklist with stamped before and after photos, for cleaners and small short-term-rental
            hosts. Not affiliated with Airbnb or any booking platform.
          </p>
          <p className="text-callout text-ink-2">
            Questions or problems:{" "}
            <a className="text-accent-ink underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="space-y-2 text-callout">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-ink-2 hover:text-ink">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-10 text-caption text-ink-2 sm:px-8">
        © 2026 Turnproof. Free, with no subscription and no ads.
      </p>
    </footer>
  );
}
