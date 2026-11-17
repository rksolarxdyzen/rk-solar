import type { ReactNode } from "react";

/** Public ad landing — no CRM chrome / watermark. */
export default function GoLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-white">{children}</div>;
}
