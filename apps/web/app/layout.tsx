import type { Metadata, Viewport } from "next";
import { Source_Sans_3 } from "next/font/google";
import { colors } from "@turnproof/shared/tokens";
import { ThemeProvider } from "@/components/theme-provider";
import { publicEnv } from "@/lib/env";
import { buildTokensCss } from "@/lib/tokens-css";
import "./globals.css";

/** Source Sans 3: a humanist sans, open and legible at small sizes (stamps, captions). */
const sourceSans = Source_Sans_3({
  variable: "--font-humanist",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const TOKENS_CSS = buildTokensCss();

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.appUrl),
  title: {
    default: "Turnproof: free turnover checklist with photo proof",
    template: "%s | Turnproof",
  },
  description:
    "A free turnover app for cleaners and small short-term-rental hosts: a room-by-room checklist, camera-only before and after photos stamped with time and place, and a proof link the host can open in any browser.",
  applicationName: "Turnproof",
  openGraph: {
    type: "website",
    siteName: "Turnproof",
    title: "Proof that the turnover happened. Free.",
    description: "Room-by-room checklist, stamped before and after photos and an expiring proof link for the host. No subscription, no ads.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: colors.light.surface },
    { media: "(prefers-color-scheme: dark)", color: colors.dark.surface },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={sourceSans.variable} suppressHydrationWarning>
      <head>
        <style id="turnproof-tokens" dangerouslySetInnerHTML={{ __html: TOKENS_CSS }} />
      </head>
      <body className="min-h-dvh antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
