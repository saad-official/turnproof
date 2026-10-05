import type { Metadata } from "next";
import { Info } from "lucide-react";
import { ProofView } from "@/components/proof/proof-view";
import { SAMPLE_TIMEZONE, sampleProof } from "@/lib/marketing/sample-proof";

export const metadata: Metadata = {
  title: "Example proof page",
  description: "What a host sees when a cleaner shares a Turnproof link: rooms with before and after photos, badges, checklist and issues. Sample data.",
};

export default function ExamplePage() {
  const { model, expiresAt } = sampleProof();
  return (
    <>
      <div className="border-b border-line bg-warning-soft">
        <p className="mx-auto flex max-w-4xl items-start gap-2 px-4 py-3 text-callout text-warning sm:px-8">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong className="font-semibold">Sample.</strong> This is an invented turnover and the photos are drawings.
            A real proof link looks exactly like this, with the cleaner&apos;s photos.
          </span>
        </p>
      </div>
      <ProofView model={model} timezone={SAMPLE_TIMEZONE} expiresAt={expiresAt} sample />
    </>
  );
}
