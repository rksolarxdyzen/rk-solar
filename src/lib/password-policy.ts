import { z } from "zod";

export type PasswordRequirement = {
  id: string;
  label: string;
  test: (password: string) => boolean;
};

export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  {
    id: "minLength",
    label: "At least 8 characters",
    test: (password) => password.length >= 8,
  },
  {
    id: "uppercase",
    label: "At least one uppercase letter (A–Z)",
    test: (password) => /[A-Z]/.test(password),
  },
  {
    id: "lowercase",
    label: "At least one lowercase letter (a–z)",
    test: (password) => /[a-z]/.test(password),
  },
  {
    id: "number",
    label: "At least one number (0–9)",
    test: (password) => /[0-9]/.test(password),
  },
  {
    id: "special",
    label: "At least one special character (!@#$…)",
    test: (password) => /[^A-Za-z0-9]/.test(password),
  },
];

export function evaluatePasswordRequirements(password: string) {
  return PASSWORD_REQUIREMENTS.map((requirement) => ({
    ...requirement,
    met: requirement.test(password),
  }));
}

export function passwordMeetsPolicy(password: string) {
  return PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(password));
}

export function passwordPolicyErrorMessage(password: string) {
  const unmet = evaluatePasswordRequirements(password)
    .filter((requirement) => !requirement.met)
    .map((requirement) => requirement.label);
  if (unmet.length === 0) return null;
  return `Password must include: ${unmet.join("; ")}.`;
}

export const teamPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be at most 128 characters.")
  .superRefine((password, ctx) => {
    const message = passwordPolicyErrorMessage(password);
    if (message) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    }
  });
