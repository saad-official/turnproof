import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { NAV } from "@/lib/marketing/content";
import { Wordmark } from "./logo";

export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <a
        href="#main"
        className="sr-only rounded-sm bg-accent px-4 py-2 text-on-accent focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-8">
        <Link href="/" className="rounded-sm" aria-label="Turnproof home">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="ml-auto hidden lg:block">
          <ul className="flex items-center gap-1 text-callout">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="rounded-sm px-3 py-2 text-ink-2 transition-colors hover:text-ink">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto lg:ml-2">
          <ThemeToggle />
        </div>
      </div>
      <nav aria-label="Main (compact)" className="border-t border-line lg:hidden">
        <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 py-1 text-callout">
          {NAV.map((item) => (
            <li key={item.href} className="shrink-0">
              <Link href={item.href} className="block rounded-sm px-3 py-2 text-ink-2 hover:text-ink">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
