"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { LeadListShell } from "@/lib/leads/lead-shell";

export type LeadModalKind = "lead" | "installation" | "customer";

interface LeadModalContextValue {
  leadId: string | null;
  modalKind: LeadModalKind | null;
  /** Instant paint from list/card until full getLead lands. */
  shell: LeadListShell | null;
  openLead: (id: string, shell?: LeadListShell) => void;
  openInstallation: (id: string, shell?: LeadListShell) => void;
  openCustomer: (id: string, shell?: LeadListShell) => void;
  closeLead: () => void;
}

const LeadModalContext = createContext<LeadModalContextValue | null>(null);

export function LeadModalProvider({ children }: { children: ReactNode }) {
  const [leadId, setLeadId] = useState<string | null>(null);
  const [modalKind, setModalKind] = useState<LeadModalKind | null>(null);
  const [shell, setShell] = useState<LeadListShell | null>(null);

  const openLead = useCallback((id: string, nextShell?: LeadListShell) => {
    setLeadId(id);
    setModalKind("lead");
    setShell(nextShell && nextShell.id === id ? nextShell : null);
    document.body.style.overflow = "hidden";
  }, []);

  const openInstallation = useCallback((id: string, nextShell?: LeadListShell) => {
    setLeadId(id);
    setModalKind("installation");
    setShell(nextShell && nextShell.id === id ? nextShell : null);
    document.body.style.overflow = "hidden";
  }, []);

  const openCustomer = useCallback((id: string, nextShell?: LeadListShell) => {
    setLeadId(id);
    setModalKind("customer");
    setShell(nextShell && nextShell.id === id ? nextShell : null);
    document.body.style.overflow = "hidden";
  }, []);

  const closeLead = useCallback(() => {
    setLeadId(null);
    setModalKind(null);
    setShell(null);
    document.body.style.overflow = "";
  }, []);

  return (
    <LeadModalContext.Provider
      value={{
        leadId,
        modalKind,
        shell,
        openLead,
        openInstallation,
        openCustomer,
        closeLead,
      }}
    >
      {children}
    </LeadModalContext.Provider>
  );
}

export function useLeadModal() {
  const ctx = useContext(LeadModalContext);
  if (!ctx) throw new Error("useLeadModal must be used within LeadModalProvider");
  return ctx;
}
