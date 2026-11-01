import { Check, Circle } from "lucide-react";
import { evaluatePasswordRequirements } from "@/lib/password-policy";
import { cn } from "@/lib/utils";

export function PasswordRequirementsChecklist({ password }: { password: string }) {
  const requirements = evaluatePasswordRequirements(password);

  return (
    <ul className="mt-2 space-y-1.5" aria-live="polite" aria-label="Password requirements">
      {requirements.map((requirement) => (
        <li
          key={requirement.id}
          className={cn(
            "flex items-start gap-2 text-xs leading-snug",
            requirement.met ? "text-[var(--success)]" : "text-[var(--text-muted)]"
          )}
        >
          {requirement.met ? (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
          )}
          <span>{requirement.label}</span>
        </li>
      ))}
    </ul>
  );
}
