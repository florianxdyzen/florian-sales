"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTradeSkuActive, upsertTradeSku, type TradeSku } from "@/actions/trade";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import {
  TRADE_FAMILIES,
  TRADE_FAMILY_LABELS,
  TRADE_SKU_DIRECTIONS,
  type TradeFamily,
  type TradeSkuDirection,
} from "@/lib/domain/trade-ledger";

export function TradeSkuAdmin({
  skus,
  canEdit,
}: {
  skus: TradeSku[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [direction, setDirection] = useState<TradeSkuDirection>("outward");
  const [family, setFamily] = useState<TradeFamily>("combo");
  const [uom, setUom] = useState("unit");

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-muted)]">
        Line types for the trade ledger. Name outward and inward items here. Free-text is always
        allowed on a line.
      </p>
      {canEdit && (
        <form
          className="grid gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              try {
                const saved = await upsertTradeSku({ name, direction, family, uom });
                if (!saved.ok) {
                  setError(saved.error);
                  return;
                }
                setName("");
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not save SKU");
              }
            });
          }}
        >
          <div className="lg:col-span-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label>Direction</Label>
            <Select
              value={direction}
              onChange={(e) => setDirection(e.target.value as TradeSkuDirection)}
            >
              {TRADE_SKU_DIRECTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Family</Label>
            <Select value={family} onChange={(e) => setFamily(e.target.value as TradeFamily)}>
              {TRADE_FAMILIES.map((f) => (
                <option key={f} value={f}>
                  {TRADE_FAMILY_LABELS[f]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>UOM</Label>
            <Input value={uom} onChange={(e) => setUom(e.target.value)} required />
          </div>
          <div className="flex items-end lg:col-span-5">
            <Button type="submit" disabled={pending}>
              Add SKU
            </Button>
          </div>
          {error && <p className="text-sm text-[var(--error)] lg:col-span-5">{error}</p>}
        </form>
      )}

      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Direction</th>
              <th className="px-4 py-2">Family</th>
              <th className="px-4 py-2">UOM</th>
              <th className="px-4 py-2">Status</th>
              {canEdit && <th className="px-4 py-2" />}
            </tr>
          </thead>
          <tbody>
            {skus.map((sku) => (
              <tr key={sku.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-2 font-medium">{sku.name}</td>
                <td className="px-4 py-2">{sku.direction}</td>
                <td className="px-4 py-2">{TRADE_FAMILY_LABELS[sku.family]}</td>
                <td className="px-4 py-2">{sku.uom}</td>
                <td className="px-4 py-2">{sku.is_active ? "Active" : "Hidden"}</td>
                {canEdit && (
                  <td className="px-4 py-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          await setTradeSkuActive(sku.id, !sku.is_active);
                          router.refresh();
                        })
                      }
                    >
                      {sku.is_active ? "Hide" : "Show"}
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
