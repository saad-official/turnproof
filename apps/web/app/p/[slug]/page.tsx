import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ProofMark } from "@/components/marketing/logo";
import { ProofView } from "@/components/proof/proof-view";
import { getDb } from "@/lib/db/client";
import { loadPublicProof } from "@/lib/services/proofs";

/**
 * Public proof page: no account needed, never indexed. Expired and revoked
 * links are answered with 410 by proxy.ts before this renders; the plain
 * messages below are the fallback if that check could not run.
 */

const NO_INDEX = { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noimageindex: true } };

const load = cache(async (slug: string) => loadPublicProof(await getDb(), slug));

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const proof = await load(slug);
  const title = proof.state === "active" ? `Turnover proof · ${proof.model.property.name}` : "Turnover proof";
  return { title, robots: NO_INDEX, referrer: "no-referrer" };
}

function Gone({ title, body }: { title: string; body: string }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md rounded-lg border border-line bg-elevated p-8 shadow-sm">
        <ProofMark className="size-8 text-accent" />
        <h1 className="mt-4 text-title font-semibold">{title}</h1>
        <p className="mt-3 text-body text-ink-2">{body}</p>
        <p className="mt-4 text-callout">
          <Link href="/" className="font-semibold text-accent-ink underline">
            What is Turnproof?
          </Link>
        </p>
      </div>
    </main>
  );
}

export default async function ProofPage({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const proof = await load(slug);
  if (proof.state === "not_found") notFound();
  if (proof.state === "expired") {
    return (
      <Gone
        title="This proof link has expired"
        body="Turnproof links stop working 60 days after they are shared. Ask the person who sent it for a new link if you still need the photos."
      />
    );
  }
  if (proof.state === "revoked") {
    return (
      <Gone
        title="This proof link was withdrawn"
        body="The person who shared it turned the link off. Ask them for a new link if you still need the photos."
      />
    );
  }
  return (
    <main>
      <ProofView model={proof.model} timezone={proof.timezone} expiresAt={proof.expiresAt} />
    </main>
  );
}
