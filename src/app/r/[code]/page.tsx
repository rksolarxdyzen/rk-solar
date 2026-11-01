import { notFound } from "next/navigation";
import { ReferralPublicForm } from "@/components/leads/referral-public-form";
import { PoweredByDyzen } from "@/components/brand/powered-by-dyzen";
import { resolveReferralLink } from "@/lib/ingest/create-lead";
import { BRAND } from "@/lib/brand";

export default async function ReferralPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const link = await resolveReferralLink(code);

  if (!link) notFound();

  const company = Array.isArray(link.company) ? link.company[0] : link.company;
  const companyName = (company as { name?: string } | null)?.name ?? BRAND.name;

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#e8eef9_0%,_#f4f7fc_55%)] px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-lg">
        <ReferralPublicForm
          code={link.code}
          companyName={companyName}
          linkLabel={link.label}
        />
        <PoweredByDyzen className="mt-6" />
      </div>
    </div>
  );
}
