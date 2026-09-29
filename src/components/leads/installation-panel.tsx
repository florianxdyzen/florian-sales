"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ProofUploadField } from "@/components/ui/proof-upload-button";
import {
  addInstallationPhoto,
  assignInstallationCrew,
  completeInstallation,
  deleteInstallationPhoto,
  listCrewMembers,
  listInstallationPhotos,
  unassignInstallationCrew,
} from "@/actions/installation";
import {
  INSTALL_PHOTO_KINDS,
  INSTALL_PHOTO_LABELS,
  installationProofGate,
  type InstallPhotoKind,
  type InstallationPhoto,
} from "@/lib/domain/installation";
import type { LeadWithRelations } from "@/lib/domain/types";
import { cn, formatDateTime } from "@/lib/utils";
import { friendlyUploadError } from "@/lib/uploads/proof-mime";

export function InstallationPanel({
  lead,
  onDone,
  canAssign = false,
  canUnassign = false,
  canUpload = false,
  canComplete = false,
  embedded = false,
}: {
  lead: LeadWithRelations;
  onDone: () => void;
  canAssign?: boolean;
  canUnassign?: boolean;
  canUpload?: boolean;
  canComplete?: boolean;
  embedded?: boolean;
}) {
  const [photos, setPhotos] = useState<InstallationPhoto[]>([]);
  const [crew, setCrew] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [crewId, setCrewId] = useState(lead.assigned_crew_id ?? "");
  const [panelCount, setPanelCount] = useState(
    String(lead.expected_panel_count ?? "")
  );
  const [serialHint, setSerialHint] = useState("");
  const [panelIndex, setPanelIndex] = useState("1");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const stages = [
    "pre_dispatch_verified",
    "installation_assigned",
    "installation_in_progress",
    "installation_completed",
  ];
  const visible = stages.includes(lead.sales_stage);
  const canEditProofs =
    canUpload &&
    lead.sales_stage !== "installation_completed" &&
    (lead.sales_stage === "installation_assigned" ||
      lead.sales_stage === "installation_in_progress");

  const gate = installationProofGate({
    photos,
    expectedPanelCount: lead.expected_panel_count,
  });

  async function reload() {
    setPhotos(await listInstallationPhotos(lead.id));
  }

  useEffect(() => {
    if (!visible) return;
    void reload().catch(() => setPhotos([]));
    if (canAssign) {
      void listCrewMembers()
        .then((rows) => setCrew(rows))
        .catch(() => setCrew([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id, canAssign, visible]);

  useEffect(() => {
    const next = photos.filter((photo) => photo.photo_kind === "panel_barcode").length + 1;
    setPanelIndex(String(next));
  }, [photos]);

  function saveProof(kind: InstallPhotoKind, fileUrl: string) {
    setError(null);
    setOkMsg(null);
    startTransition(async () => {
      try {
        await addInstallationPhoto({
          leadId: lead.id,
          photoKind: kind,
          fileUrl,
          caption: null,
          panelIndex: kind === "panel_barcode" ? Number(panelIndex) || null : null,
          serialHint: kind === "panel_barcode" ? serialHint || null : null,
        });
        if (kind === "panel_barcode") setSerialHint("");
        await reload();
        setOkMsg("Proof added");
        onDone();
      } catch (err) {
        setError(friendlyUploadError(err));
      }
    });
  }

  if (!visible) return null;

  return (
    <div
      className={cn(
        "space-y-4",
        !embedded && "rounded-xl border border-[var(--border)] bg-white p-4"
      )}
    >
      <div>
        {!embedded && (
          <h3 className="font-semibold text-[var(--text-dark)]">Installation</h3>
        )}
        <p className="text-xs text-[var(--text-muted)]">
          Owner assigns installation crew after Accounts verifies Token and
          Pre-dispatch. Crew: {gate.siteCount} site · {gate.barcodeCount}/
          {gate.needed} barcodes.
        </p>
      </div>

      {canAssign && lead.sales_stage !== "installation_completed" && (
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            setOkMsg(null);
            startTransition(async () => {
              try {
                await assignInstallationCrew({
                  leadId: lead.id,
                  crewId,
                  expectedPanelCount: panelCount ? Number(panelCount) : null,
                });
                setOkMsg("Crew assigned");
                onDone();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed");
              }
            });
          }}
        >
          <div className="sm:col-span-2">
            <Label>Crew member</Label>
            <select
              className="w-full rounded-lg border-[1.5px] border-[var(--border)] bg-white px-3 py-2 text-sm"
              required
              value={crewId}
              onChange={(e) => setCrewId(e.target.value)}
            >
              <option value="">Select…</option>
              {crew.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Expected panels</Label>
            <Input
              type="number"
              min={1}
              value={panelCount}
              onChange={(e) => setPanelCount(e.target.value)}
              placeholder="e.g. 10"
            />
          </div>
          <div className="sm:col-span-3 flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={pending || !crewId}>
              {pending ? "Saving…" : "Assign crew"}
            </Button>
            {canUnassign && lead.assigned_crew_id && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setError(null);
                    setOkMsg(null);
                    try {
                      await unassignInstallationCrew(lead.id);
                      setCrewId("");
                      setOkMsg("Crew unassigned");
                      onDone();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Failed");
                    }
                  })
                }
              >
                Unassign
              </Button>
            )}
          </div>
        </form>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[var(--text-dark)]">Add proofs</h3>
        {INSTALL_PHOTO_KINDS.map((kind) => {
          const items = photos.filter((photo) => photo.photo_kind === kind);
          return (
            <section
              key={kind}
              className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-white)] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-[var(--text-dark)]">
                    {INSTALL_PHOTO_LABELS[kind]}
                  </h4>
                  <p className="text-xs text-[var(--text-muted)]">
                    {kind === "site"
                      ? `${gate.siteCount} uploaded`
                      : kind === "panel_barcode"
                        ? `${gate.barcodeCount}/${gate.needed} barcodes`
                        : `${items.length} uploaded`}
                  </p>
                </div>
              </div>

              {items.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {items.map((photo) => (
                    <li
                      key={photo.id}
                      className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[var(--border-light)] bg-white px-3 py-2"
                    >
                      <div>
                        <p className="font-medium">
                          {INSTALL_PHOTO_LABELS[photo.photo_kind]}
                          {photo.panel_index != null ? ` #${photo.panel_index}` : ""}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {formatDateTime(photo.created_at)}
                          {photo.serial_hint ? ` · ${photo.serial_hint}` : ""}
                        </p>
                        <a
                          href={photo.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-[var(--primary)]"
                        >
                          Open
                        </a>
                      </div>
                      {canEditProofs && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              await deleteInstallationPhoto(photo.id);
                              await reload();
                            })
                          }
                        >
                          Remove
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">None uploaded yet.</p>
              )}

              {canEditProofs && (
                <div className="space-y-3">
                  {kind === "panel_barcode" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label>Panel index</Label>
                        <Input
                          type="number"
                          min={1}
                          value={panelIndex}
                          onChange={(e) => setPanelIndex(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Serial / DCR hint</Label>
                        <Input
                          value={serialHint}
                          onChange={(e) => setSerialHint(e.target.value)}
                          placeholder="Optional"
                        />
                      </div>
                    </div>
                  )}
                  <ProofUploadField
                    folder="installation"
                    entityId={lead.id}
                    disabled={pending}
                    onUploaded={(url) => saveProof(kind, url)}
                  />
                </div>
              )}
            </section>
          );
        })}
      </div>

      {canComplete &&
        lead.sales_stage !== "installation_completed" &&
        (lead.sales_stage === "installation_assigned" ||
          lead.sales_stage === "installation_in_progress") && (
          <Button
            type="button"
            size="sm"
            disabled={pending || !gate.ok}
            title={gate.ok ? undefined : gate.missing.join("; ")}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                setOkMsg(null);
                try {
                  const result = await completeInstallation(lead.id);
                  setOkMsg(
                    `Installation completed. Notified: ${result.notified.join(", ")}`
                  );
                  onDone();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed");
                }
              })
            }
          >
            Complete installation
          </Button>
        )}

      {error && <p className="text-sm text-[var(--error)]">{error}</p>}
      {okMsg && <p className="text-sm text-[var(--success)]">{okMsg}</p>}
    </div>
  );
}
