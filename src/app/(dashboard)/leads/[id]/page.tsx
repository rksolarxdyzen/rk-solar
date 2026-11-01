import { OpenLeadRedirect } from "@/components/leads/open-lead-redirect";

export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OpenLeadRedirect leadId={id} />;
}
