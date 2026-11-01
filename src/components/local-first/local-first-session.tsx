"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Profile } from "@/lib/domain/types";
import type { AuthorityKey } from "@/lib/domain/authorities";

type Session = {
  profile: Profile;
  authorities: AuthorityKey[];
  companyId: string;
  userId: string;
};

const Ctx = createContext<Session | null>(null);

export function LocalFirstSessionProvider({
  profile,
  authorities,
  children,
}: {
  profile: Profile;
  authorities: AuthorityKey[];
  children: ReactNode;
}) {
  return (
    <Ctx.Provider
      value={{
        profile,
        authorities,
        companyId: profile.company_id,
        userId: profile.id,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useLocalFirstSession(): Session {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useLocalFirstSession must be used within LocalFirstSessionProvider");
  }
  return ctx;
}

export function useOptionalLocalFirstSession(): Session | null {
  return useContext(Ctx);
}
