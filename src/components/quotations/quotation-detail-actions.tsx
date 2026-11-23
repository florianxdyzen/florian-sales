"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { acceptQuotation, markQuotationSent } from "@/actions/quotations";
import type { QuotationRow } from "@/lib/quotations/types";
import { QUOTE_STATUS_LABELS, quoteTemplateDisplayLabel } from "@/lib/quotations/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { quotationPdfBasename } from "@/lib/quotations/quote-pdf-filename";
import {
  quotationWhatsAppMessage,
  whatsappChatUrl,
} from "@/lib/quotations/whatsapp";
import { DuplicateQuotationModal } from "@/components/quotations/duplicate-quotation-modal";
import type { QuoteLeadOption } from "@/components/quotations/quote-customer-picker";

export function QuotationDetailActions({
  quote,
  leads = [],
  canAddLead = false,
  canDuplicate = false,
}: {
  quote: QuotationRow;
  leads?: QuoteLeadOption[];
  canAddLead?: boolean;
  canDuplicate?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dupOpen, setDupOpen] = useState(false);
  const editable = quote.status !== "accepted";

  const downloadHref = `/quotations/${quote.id}/print?download=1`;
  const waUrl = whatsappChatUrl(
    quote.customer_phone,
    quotationWhatsAppMessage({
      quotationNo: quote.quotation_no,
      customerName: quote.customer_name,
      systemSizeKw: quote.system_size_kw,
      grandTotal: quote.grand_total,
    })
  );
  const pdfName = quotationPdfBasename({
    customerName: quote.customer_name,
    systemSizeKw: quote.system_size_kw,
    quotationNo: quote.quotation_no,
  });

  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href="/quotations"
        className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-body)] hover:bg-[var(--bg)]"
      >
        ← Quotations
      </Link>
      {editable && (
        <Link
          href={`/quotations/${quote.id}/edit`}
          className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-body)] hover:bg-[var(--bg)]"
        >
          Edit
        </Link>
      )}
      {canDuplicate && (
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => setDupOpen(true)}>
          Duplicate for customer
        </Button>
      )}
      <Link
        href={downloadHref}
        className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-body)] hover:bg-[var(--bg)]"
        title={`Save as ${pdfName}.pdf`}
      >
        Download PDF
      </Link>
      {waUrl ? (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`Opens WhatsApp and downloads ${pdfName}.pdf`}
          onClick={() => {
            // Same click: open print/download so staff can Save as PDF, then WhatsApp chat.
            window.open(downloadHref, "_blank", "noopener,noreferrer");
          }}
          className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
        >
          WhatsApp + PDF
        </a>
      ) : (
        <span
          className="inline-flex cursor-not-allowed items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm font-semibold text-[var(--text-muted)]"
          title="Add a customer phone to open WhatsApp"
        >
          WhatsApp + PDF
        </span>
      )}
      <Link
        href={`/quotations/${quote.id}/print`}
        className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-body)] hover:bg-[var(--bg)]"
      >
        Print
      </Link>
      {quote.status === "draft" && (
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await markQuotationSent(quote.id);
              router.refresh();
            })
          }
        >
          Mark sent
        </Button>
      )}
      {quote.status !== "accepted" && (
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await acceptQuotation(quote.id);
              router.refresh();
            })
          }
        >
          Accept quotation
        </Button>
      )}

      {canDuplicate ? (
        <DuplicateQuotationModal
          open={dupOpen}
          onClose={() => setDupOpen(false)}
          quotationId={quote.id}
          sourceLabel={quote.quotation_no}
          leads={leads}
          canAddLead={canAddLead}
        />
      ) : null}
    </div>
  );
}

export function QuotationSummaryCard({ quote }: { quote: QuotationRow }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {quoteTemplateDisplayLabel(quote)} ·{" "}
            {QUOTE_STATUS_LABELS[quote.status]}
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--text-dark)]">
            {quote.quotation_no}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {quote.customer_name}
            {quote.customer_phone ? ` · ${quote.customer_phone}` : ""} ·{" "}
            {formatDate(quote.quote_date)}
          </p>
        </div>
        <p className="text-2xl font-semibold text-[var(--primary)]">
          {formatCurrency(Number(quote.grand_total))}
        </p>
      </div>
    </div>
  );
}
