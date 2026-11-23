"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function PrintToolbar({
  quotationNo,
  backHref,
  listHref = "/quotations",
  autoPrint = false,
  downloadBasename,
}: {
  quotationNo: string;
  backHref: string;
  listHref?: string;
  autoPrint?: boolean;
  /** When set with autoPrint, document.title is set so Save as PDF uses this name. */
  downloadBasename?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!autoPrint) return;
    const previousTitle = document.title;
    if (downloadBasename?.trim()) {
      document.title = downloadBasename.trim();
    }
    const t = window.setTimeout(() => window.print(), 400);
    return () => {
      window.clearTimeout(t);
      document.title = previousTitle;
    };
  }, [autoPrint, downloadBasename]);

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(backHref);
  }

  function handlePrint() {
    if (downloadBasename?.trim()) {
      const previousTitle = document.title;
      document.title = downloadBasename.trim();
      window.print();
      window.setTimeout(() => {
        document.title = previousTitle;
      }, 1000);
      return;
    }
    window.print();
  }

  return (
    <div className="qp-toolbar">
      <p>
        Print-ready quotation · <strong>{quotationNo}</strong> · Use browser Print → Save as PDF
        {downloadBasename ? (
          <>
            {" "}
            · suggested name <strong>{downloadBasename}.pdf</strong>
          </>
        ) : null}
      </p>
      <div className="qp-toolbar-actions">
        <button type="button" className="qp-btn-ghost" onClick={handleBack}>
          Back
        </button>
        <a className="qp-btn-ghost" href={listHref}>
          All quotations
        </a>
        <button type="button" className="qp-btn-print" onClick={handlePrint}>
          Print / Save PDF
        </button>
      </div>
    </div>
  );
}
