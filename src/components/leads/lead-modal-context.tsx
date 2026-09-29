"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type LeadModalKind = "lead" | "installation" | "customer";

interface LeadModalContextValue {
  leadId: string | null;
  modalKind: LeadModalKind | null;
  openLead: (id: string) => void;
  openInstallation: (id: string) => void;
  openCustomer: (id: string) => void;
  closeLead: () => void;
}

const LeadModalContext = createContext<LeadModalContextValue | null>(null);

export function LeadModalProvider({ children }: { children: ReactNode }) {
  const [leadId, setLeadId] = useState<string | null>(null);
  const [modalKind, setModalKind] = useState<LeadModalKind | null>(null);

  const openLead = useCallback((id: string) => {
    setLeadId(id);
    setModalKind("lead");
    document.body.style.overflow = "hidden";
  }, []);

  const openInstallation = useCallback((id: string) => {
    setLeadId(id);
    setModalKind("installation");
    document.body.style.overflow = "hidden";
  }, []);

  const openCustomer = useCallback((id: string) => {
    setLeadId(id);
    setModalKind("customer");
    document.body.style.overflow = "hidden";
  }, []);

  const closeLead = useCallback(() => {
    setLeadId(null);
    setModalKind(null);
    document.body.style.overflow = "";
  }, []);

  return (
    <LeadModalContext.Provider
      value={{ leadId, modalKind, openLead, openInstallation, openCustomer, closeLead }}
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
