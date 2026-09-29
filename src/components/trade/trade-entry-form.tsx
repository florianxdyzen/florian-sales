"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTradeEntry, type TradeSku } from "@/actions/trade";
import { ProofUploadButton } from "@/components/ui/proof-upload-button";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import {
  TRADE_ATTACHMENT_LABELS,
  type TradeAttachmentKind,
  type TradeDirection,
} from "@/lib/domain/trade-ledger";

type PendingFile = { kind: TradeAttachmentKind; file_url: string; title: string };

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function TradeEntryForm({
  leadId,
  direction,
  skus,
}: {
  leadId: string;
  direction: TradeDirection;
  skus: TradeSku[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [skuId, setSkuId] = useState("");
  const [itemName, setItemName] = useState("");
  const [saveNamedSku, setSaveNamedSku] = useState(false);
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayIso);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [grNo, setGrNo] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [transporterName, setTransporterName] = useState("");
  const [dispatchOn, setDispatchOn] = useState("");
  const [receivedOn, setReceivedOn] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);

  const filteredSkus = useMemo(
    () => skus.filter((s) => s.direction === direction || s.direction === "both"),
    [skus, direction]
  );

  const fileKinds: TradeAttachmentKind[] =
    direction === "outward" ? ["invoice", "gr", "other"] : ["purchase_bill", "other"];

  function addFile(kind: TradeAttachmentKind, url: string) {
    setFiles((prev) => [...prev, { kind, file_url: url, title: TRADE_ATTACHMENT_LABELS[kind] }]);
  }

  function onSkuChange(id: string) {
    setSkuId(id);
    const sku = filteredSkus.find((s) => s.id === id);
    if (sku) {
      setItemName(sku.name);
      setSaveNamedSku(false);
    }
  }

  return (
    <form
      className="space-y-3 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow)]"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          try {
            await createTradeEntry({
              leadId,
              direction,
              occurredOn,
              skuId: skuId || null,
              description: itemName.trim(),
              qty: 1,
              uom: "unit",
              amountInr: Number(amount),
              invoiceNo: invoiceNo || null,
              grNo: grNo || null,
              vehicleNo: vehicleNo || null,
              transporterName: transporterName || null,
              saveNamedSku: !skuId && saveNamedSku,
              dispatchedOn: direction === "outward" ? dispatchOn || null : null,
              receivedOn: direction === "inward" ? receivedOn || null : null,
              notes: notes || null,
              attachments: files,
            });
            setAmount("");
            setInvoiceNo("");
            setGrNo("");
            setVehicleNo("");
            setTransporterName("");
            setNotes("");
            setFiles([]);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save line");
          }
        });
      }}
    >
      <p className="text-sm font-semibold text-[var(--text-dark)]">
        {direction === "outward" ? "Log outward sale" : "Log inward receipt"}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Saved item name</Label>
          <Select value={skuId} onChange={(e) => onSkuChange(e.target.value)}>
            <option value="">Type a new name</option>
            {filteredSkus.map((sku) => (
              <option key={sku.id} value={sku.id}>
                {sku.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Item name</Label>
          <Input
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder={direction === "outward" ? "e.g. Combo 4-in-1" : "e.g. Waaree 540W"}
            required
          />
        </div>
        <div>
          <Label>Amount ₹</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div>
          <Label>Business date</Label>
          <Input type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} required />
        </div>
        <div>
          <Label>{direction === "outward" ? "Invoice no." : "Vendor bill no."}</Label>
          <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
        </div>
        {direction === "outward" ? (
          <>
            <div>
              <Label>GR no. (optional)</Label>
              <Input value={grNo} onChange={(e) => setGrNo(e.target.value)} />
            </div>
            <div>
              <Label>Vehicle (optional)</Label>
              <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} />
            </div>
            <div>
              <Label>Transporter (optional)</Label>
              <Input value={transporterName} onChange={(e) => setTransporterName(e.target.value)} />
            </div>
            <div>
              <Label>Dispatch date</Label>
              <Input type="date" value={dispatchOn} onChange={(e) => setDispatchOn(e.target.value)} />
            </div>
          </>
        ) : (
          <>
            <div>
              <Label>Vehicle (optional)</Label>
              <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} />
            </div>
            <div>
              <Label>Transporter (optional)</Label>
              <Input value={transporterName} onChange={(e) => setTransporterName(e.target.value)} />
            </div>
            <div>
              <Label>Received date</Label>
              <Input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
            </div>
          </>
        )}
      </div>
      {!skuId && (
        <label className="flex items-center gap-2 text-sm text-[var(--text-body)]">
          <input
            type="checkbox"
            checked={saveNamedSku}
            onChange={(e) => setSaveNamedSku(e.target.checked)}
          />
          Save this item name for later
        </label>
      )}
      <div>
        <Label>Notes</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>
      <div className="space-y-2">
        <p className="text-[0.69rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Attachments (Invoice PDF / GR / bill)
        </p>
        <div className="flex flex-wrap gap-2">
          {fileKinds.map((kind) => (
            <ProofUploadButton
              key={kind}
              folder="trade"
              entityId={leadId}
              label={TRADE_ATTACHMENT_LABELS[kind]}
              onUploaded={(url) => addFile(kind, url)}
            />
          ))}
        </div>
        {files.length > 0 && (
          <ul className="text-xs text-[var(--text-muted)]">
            {files.map((f, i) => (
              <li key={`${f.file_url}-${i}`}>
                {TRADE_ATTACHMENT_LABELS[f.kind]} attached
                <button
                  type="button"
                  className="ml-2 text-[var(--error)]"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="text-sm text-[var(--error)]">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save line"}
      </Button>
    </form>
  );
}
