import { cn } from "@/lib/utils";

const variants: Record<string, string> = {
  new_lead: "bg-[var(--stage-new-light)] text-[var(--stage-new)]",
  contacted: "bg-[var(--primary-light)] text-[var(--primary)]",
  visit_scheduled: "bg-[var(--accent-light)] text-[var(--accent-hover)]",
  survey_in_progress: "bg-[var(--info-light)] text-[var(--info)]",
  survey_completed: "bg-[var(--success-light)] text-[var(--success)]",
  quoted: "bg-[var(--primary-light)] text-[var(--primary)]",
  quote_accepted: "bg-[var(--accent-light)] text-[var(--accent-hover)]",
  token_pending_verification: "bg-[var(--warn-light)] text-[var(--warn)]",
  token_verified_and_feasibility_ok: "bg-[var(--success-light)] text-[var(--success)]",
  pre_dispatch_pending_verification: "bg-[var(--warn-light)] text-[var(--warn)]",
  pre_dispatch_verified: "bg-[var(--success-light)] text-[var(--success)]",
  installation_assigned: "bg-[var(--info-light)] text-[var(--info)]",
  installation_in_progress: "bg-[var(--accent-light)] text-[var(--accent-hover)]",
  installation_completed: "bg-[var(--success-light)] text-[var(--success)]",
  final_pending_verification: "bg-[var(--warn-light)] text-[var(--warn)]",
  final_verified: "bg-[var(--success-light)] text-[var(--success)]",
  liaison_in_progress: "bg-[var(--info-light)] text-[var(--info)]",
  meter_installed: "bg-[var(--accent-light)] text-[var(--accent-hover)]",
  subsidy_pending: "bg-[var(--warn-light)] text-[var(--warn)]",
  subsidy_received_pending_accounts: "bg-[var(--warn-light)] text-[var(--warn)]",
  completed: "bg-[var(--success-light)] text-[var(--success)]",
  lost: "bg-[var(--error-light)] text-[var(--error)]",
  hot: "bg-[var(--error-light)] text-[var(--error)]",
  warm: "bg-[var(--warn-light)] text-[var(--warn)]",
  cold: "bg-[var(--primary-light)] text-[var(--primary)]",
  warn: "bg-[var(--warn-light)] text-[var(--warn)]",
  default: "bg-[var(--bg)] text-[var(--text-muted)]",
};

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[0.67rem] font-semibold",
        variants[variant] ?? variants.default,
        className
      )}
    >
      {children}
    </span>
  );
}
