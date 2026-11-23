"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LeadNameAutocomplete } from "@/components/quotations/lead-name-autocomplete";
import type { QuoteLeadOption } from "@/components/quotations/quote-customer-picker";
import { duplicateQuotation } from "@/lib/quotations/actions/quotation";

export function DuplicateQuotationModal({
  open,
  onClose,
  quotationId,
  sourceLabel,
  leads = [],
  canAddLead = false,
}: {
  open: boolean;
  onClose: () => void;
  quotationId: string;
  sourceLabel: string;
  leads?: QuoteLeadOption[];
  canAddLead?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [error, setError] = useState("");

  function reset() {
    setName("");
    setPhone("");
    setLeadId(null);
    setError("");
  }

  function handleClose() {
    if (pending) return;
    reset();
    onClose();
  }

  function onLeadSelect(lead: QuoteLeadOption) {
    setLeadId(lead.id);
    setName(lead.name);
    setPhone(lead.phone ?? "");
  }

  function onNameChange(next: string) {
    setName(next);
    if (leadId) {
      const linked = leads.find((l) => l.id === leadId);
      if (!linked || linked.name !== next) setLeadId(null);
    }
  }

  function submit() {
    const customerName = name.trim();
    if (customerName.length < 2) {
      setError("Enter a customer name.");
      return;
    }
    const digits = phone.replace(/\D/g, "");
    if (digits.length > 0 && digits.length < 10) {
      setError("Enter a valid phone (10+ digits) or leave blank.");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        const newId = await duplicateQuotation(quotationId, {
          customerName,
          customerPhone: phone.trim() || null,
          leadId,
        });
        reset();
        onClose();
        router.push(`/quotations/${newId}/edit`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to duplicate quotation");
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Duplicate for another customer"
      subtitle={`Copies system, pricing, and BOM from ${sourceLabel}. Sets a new name and number.`}
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Customer name</label>
          <LeadNameAutocomplete
            leads={leads}
            canAddLead={canAddLead}
            value={name}
            onChange={onNameChange}
            onLeadSelect={onLeadSelect}
            selectedLeadId={leadId}
            placeholder="Name or search leads…"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Phone <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Mobile number"
            inputMode="tel"
            className="min-h-11"
          />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" disabled={pending} onClick={handleClose}>
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={submit}>
            {pending ? "Duplicating…" : "Create draft"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
