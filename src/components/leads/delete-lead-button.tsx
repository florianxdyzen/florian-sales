"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteLead } from "@/actions/leads";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

export function DeleteLeadButton({
  leadId,
  leadName,
  onDeleted,
}: {
  leadId: string;
  leadName: string;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const expected = leadName.trim();
  const matches =
    typed.trim() === expected || typed.trim().toUpperCase() === "DELETE";

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="danger"
        onClick={() => {
          setTyped("");
          setError(null);
          setOpen(true);
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Delete this file?"
        subtitle="This permanently removes the lead/customer and related records. It cannot be undone."
        layer="nested"
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!matches) return;
            setError(null);
            startTransition(async () => {
              try {
                await deleteLead(leadId);
                setOpen(false);
                onDeleted?.();
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not delete");
              }
            });
          }}
        >
          <p className="text-sm text-[var(--text-body)]">
            Type <span className="font-semibold">{expected}</span> or{" "}
            <span className="font-semibold">DELETE</span> to confirm.
          </p>
          <div>
            <Label>Confirm</Label>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={expected}
              autoComplete="off"
            />
          </div>
          {error && <p className="text-sm text-[var(--error)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" variant="danger" disabled={pending || !matches}>
              {pending ? "Deleting…" : "Delete permanently"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
