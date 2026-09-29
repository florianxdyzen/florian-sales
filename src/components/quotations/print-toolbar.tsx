"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function PrintToolbar({
  quotationNo,
  backHref,
  listHref = "/quotations",
  autoPrint = false,
}: {
  quotationNo: string;
  backHref: string;
  listHref?: string;
  autoPrint?: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!autoPrint) return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [autoPrint]);

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(backHref);
  }

  return (
    <div className="qp-toolbar">
      <p>
        Print-ready quotation · <strong>{quotationNo}</strong> · Use browser Print → Save as PDF
      </p>
      <div className="qp-toolbar-actions">
        <button type="button" className="qp-btn-ghost" onClick={handleBack}>
          Back
        </button>
        <a className="qp-btn-ghost" href={listHref}>
          All quotations
        </a>
        <button type="button" className="qp-btn-print" onClick={() => window.print()}>
          Print / Save PDF
        </button>
      </div>
    </div>
  );
}
