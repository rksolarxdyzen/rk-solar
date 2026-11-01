export const PROJECT_TYPES = ["residential", "commercial"] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  residential: "Residential",
  commercial: "Commercial",
};

export function parseProjectType(value: unknown): ProjectType {
  if (typeof value !== "string") return "residential";
  const normalized = value.trim().toLowerCase();
  if (normalized === "commercial" || normalized.includes("commercial")) return "commercial";
  if (normalized === "residential" || normalized.includes("residential")) return "residential";
  return "residential";
}

export function projectTypeLabel(value: unknown): string {
  return PROJECT_TYPE_LABELS[parseProjectType(value)];
}
