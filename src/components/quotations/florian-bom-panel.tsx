"use client";

import { useRef, useState, useTransition } from "react";
import { uploadQuotationBomImage } from "@/lib/quotations/actions/quotation";
import {
  cloneFlorianSampleBom,
  type FlorianBomItem,
} from "@/lib/quotations/sample-bom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function FlorianBomPanel({
  items,
  quoteOnly,
  onItemsChange,
  onQuoteOnlyChange,
}: {
  items: FlorianBomItem[];
  quoteOnly: boolean;
  onItemsChange: (items: FlorianBomItem[]) => void;
  onQuoteOnlyChange: (quoteOnly: boolean) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, startUpload] = useTransition();

  function patch(id: string, next: Partial<FlorianBomItem>) {
    onItemsChange(items.map((row) => (row.id === id ? { ...row, ...next } : row)));
  }

  function onFile(list: FileList | null) {
    const file = list?.[0];
    const id = targetId;
    if (fileRef.current) fileRef.current.value = "";
    if (!file || !id) return;
    setError("");
    startUpload(async () => {
      try {
        const body = new FormData();
        body.set("file", file);
        const uploaded = await uploadQuotationBomImage(body);
        patch(id, { imageUrl: uploaded.url });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to upload image");
      }
    });
  }

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-[var(--primary)]"
          checked={quoteOnly}
          onChange={(e) => onQuoteOnlyChange(e.target.checked)}
        />
        <span>
          <span className="block text-sm font-semibold text-slate-800">
            Change only for this quotation
          </span>
          <span className="mt-0.5 block text-xs text-slate-500">
            {quoteOnly
              ? "Photo and text changes stay on this quotation. The last-used list is not changed."
              : "Saving also stores this list as the last-used bill of materials for the next solar quotation."}
          </span>
        </span>
      </label>

      <div className="flex justify-end">
        <button
          type="button"
          className="text-xs font-semibold text-[var(--primary)] hover:underline"
          onClick={() => onItemsChange(cloneFlorianSampleBom())}
        >
          Reset to sample
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => onFile(e.target.files)}
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="space-y-3">
        {items.map((row, index) => (
          <div key={row.id} className="rounded-xl border border-slate-200 p-3">
            <div className="flex gap-3">
              {row.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.imageUrl}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 bg-white object-contain"
                />
              ) : (
                <div className="h-16 w-16 shrink-0 rounded-lg border border-dashed border-slate-300" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {index + 1}
                </p>
                <Input
                  value={row.component}
                  onChange={(e) => patch(row.id, { component: e.target.value })}
                  className="mt-1 min-h-10"
                  aria-label={`Material ${index + 1} name`}
                />
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600">
                Specification
                <Input
                  value={row.specification}
                  onChange={(e) => patch(row.id, { specification: e.target.value })}
                  className="mt-1 min-h-10"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Make
                <Input
                  value={row.make}
                  onChange={(e) => patch(row.id, { make: e.target.value })}
                  className="mt-1 min-h-10"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Quantity
                <Input
                  value={row.quantity}
                  onChange={(e) => patch(row.id, { quantity: e.target.value })}
                  className="mt-1 min-h-10"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Unit
                <Input
                  value={row.unit}
                  onChange={(e) => patch(row.id, { unit: e.target.value })}
                  className="mt-1 min-h-10"
                />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Input
                value={row.imageUrl}
                onChange={(e) => patch(row.id, { imageUrl: e.target.value })}
                placeholder="/brand/bom-florian/… or image URL"
                className="min-h-10 min-w-[12rem] flex-1"
                aria-label={`Image for ${row.component}`}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                className="min-h-10"
                onClick={() => {
                  setTargetId(row.id);
                  fileRef.current?.click();
                }}
              >
                {pending && targetId === row.id ? "Uploading…" : "Upload image"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
