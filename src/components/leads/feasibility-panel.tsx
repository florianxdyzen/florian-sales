"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { ProofUploadField } from "@/components/ui/proof-upload-button";
import {
  listFeasibilityForLead,
  submitFeasibilityReport,
} from "@/actions/feasibility";
import type { FeasibilityReport } from "@/lib/domain/payments";
import type { LeadWithRelations } from "@/lib/domain/types";
import { isWonOrLaterStage } from "@/lib/domain/workflow";
import { proofsStoragePathFromUrl } from "@/lib/storage-url";
import { formatDateTime } from "@/lib/utils";
import { friendlyUploadError } from "@/lib/uploads/proof-mime";

export function FeasibilityPanel({
  lead,
  onDone,
  canUpload = false,
}: {
  lead: LeadWithRelations;
  onDone: () => void;
  canUpload?: boolean;
  /** Unused — PDF upload auto-clears the gate (Phase B). */
  canApprove?: boolean;
}) {
  const [reports, setReports] = useState<FeasibilityReport[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("Grid Feasibility Report");
  const [notes, setNotes] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [storagePath, setStoragePath] = useState<string | null>(null);

  async function reload() {
    setReports(await listFeasibilityForLead(lead.id));
  }

  useEffect(() => {
    void reload().catch(() => setReports([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  if (!isWonOrLaterStage(lead.sales_stage) && !lead.feasibility_approved) {
    return null;
  }

  const latest = reports[0];
  const hasPdf = Boolean(latest?.file_url);

  return (
    <div className="space-y-4 rounded-xl border border-[var(--border)] bg-white p-4">
      <div>
        <h3 className="font-semibold text-[var(--text-dark)]">
          Pre-install feasibility
        </h3>
        <p className="text-xs text-[var(--text-muted)]">
          Upload the grid feasibility PDF. No separate approval — Documentation may
          do this as soon as the file is Won (Accounts token verify is separate).
        </p>
        {lead.feasibility_approved ? (
          <p className="mt-1 text-xs font-semibold text-[var(--success)]">
            PDF on file
          </p>
        ) : (
          <p className="mt-1 text-xs font-semibold text-[var(--warn)]">
            Waiting for PDF
          </p>
        )}
      </div>

      <ul className="space-y-2 text-sm">
        {reports.map((r) => (
          <li
            key={r.id}
            className="rounded-lg border border-[var(--border-light)] px-3 py-2"
          >
            <p className="font-semibold text-[var(--text-dark)]">{r.title}</p>
            <p className="text-xs text-[var(--text-muted)]">
              {formatDateTime(r.created_at)}
            </p>
            {r.notes && <p className="mt-1 text-xs">{r.notes}</p>}
            {r.file_url && (
              <a
                href={r.file_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-[var(--primary)]"
              >
                Open PDF
              </a>
            )}
          </li>
        ))}
        {reports.length === 0 && (
          <li className="text-xs text-[var(--text-muted)]">No PDF uploaded yet.</li>
        )}
      </ul>

      {canUpload && isWonOrLaterStage(lead.sales_stage) && (
        <form
          className="space-y-3 border-t border-[var(--border-light)] pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              try {
                if (!fileUrl) throw new Error("Upload a PDF feasibility report");
                await submitFeasibilityReport({
                  leadId: lead.id,
                  title: title || "Grid Feasibility Report",
                  notes: notes || null,
                  fileUrl,
                  storagePath,
                });
                setNotes("");
                setFileUrl("");
                setStoragePath(null);
                await reload();
                onDone();
              } catch (err) {
                setError(friendlyUploadError(err));
              }
            });
          }}
        >
          <p className="text-sm font-semibold">
            {hasPdf ? "Replace PDF" : "Upload PDF"}
          </p>
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Feasibility PDF</Label>
            {fileUrl ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-[var(--primary)]"
                >
                  PDF uploaded — open
                </a>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setFileUrl("");
                    setStoragePath(null);
                  }}
                >
                  Replace
                </Button>
              </div>
            ) : (
              <ProofUploadField
                folder="feasibility"
                entityId={lead.id}
                accept="application/pdf,.pdf"
                hint="PDF only · max 4 MB"
                label="Choose PDF to upload"
                onUploaded={(url) => {
                  setFileUrl(url);
                  setStoragePath(proofsStoragePathFromUrl(url));
                  setError(null);
                }}
              />
            )}
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button type="submit" size="sm" disabled={pending || !fileUrl}>
            {pending ? "Saving…" : hasPdf ? "Replace feasibility PDF" : "Save feasibility PDF"}
          </Button>
        </form>
      )}

      {error && (
        <p className="text-sm text-[var(--error)]">{friendlyUploadError(error)}</p>
      )}
    </div>
  );
}
