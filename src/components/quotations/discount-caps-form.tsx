"use client";

import { useState, useTransition } from "react";
import { saveDiscountCaps } from "@/lib/quotations/actions/discount-caps";
import type { DiscountCaps } from "@/lib/quotations/discount-caps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DiscountCapsForm({
  initial,
  canEdit,
}: {
  initial: DiscountCaps;
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const [percent, setPercent] = useState(String(initial.maxDiscountPercent || ""));
  const [perKw, setPerKw] = useState(String(initial.maxDiscountPerKw || ""));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function save() {
    if (!canEdit) return;
    start(async () => {
      setError("");
      setMessage("");
      const result = await saveDiscountCaps({
        maxDiscountPercent: Number(percent) || 0,
        maxDiscountPerKw: Number(perKw) || 0,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("Discount limits saved. Sales cannot exceed these on save.");
    });
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-4">
      <p className="text-sm font-semibold text-[var(--text-dark)]">Discount limits</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Default 0 / ₹0 — sales cannot apply a discount until Owner raises a cap. Leave a field at
        0 to ignore that rule. If both are set, a quote must pass both limits.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
            Max discount %
          </label>
          <Input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={percent}
            disabled={!canEdit || pending}
            onChange={(e) => setPercent(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
            Max discount ₹/kW
          </label>
          <Input
            type="number"
            min={0}
            step={1}
            value={perKw}
            disabled={!canEdit || pending}
            onChange={(e) => setPerKw(e.target.value)}
          />
        </div>
      </div>
      {canEdit ? (
        <Button type="button" className="mt-3" size="sm" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save limits"}
        </Button>
      ) : null}
      {message ? <p className="mt-2 text-xs text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
