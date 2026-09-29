"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAccountCodeStart, type AccountCodeSettings } from "@/actions/account-code-settings";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function AccountCodeSettingsForm({ initial }: { initial: AccountCodeSettings }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [nextN, setNextN] = useState(String(initial.nextN));
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const preview = `${initial.prefix}${nextN.replace(/\D/g, "") || "…"}`;

  return (
    <form
      className="max-w-lg space-y-4 rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow)]"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setOk(null);
        start(async () => {
          try {
            const res = await saveAccountCodeStart(Number(nextN));
            setNextN(String(res.nextN));
            setOk(`Next new account will be ${res.preview}. Existing codes are not renamed.`);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save");
          }
        });
      }}
    >
      <div>
        <h2 className="font-semibold text-[var(--text-dark)]">Account code start</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Prefix stays <span className="font-mono font-semibold">{initial.prefix}</span>. If that
          number is already used, the next unused FLR code is issued.
        </p>
      </div>
      <div>
        <Label>Next number</Label>
        <Input
          type="number"
          min={1}
          step={1}
          value={nextN}
          onChange={(e) => setNextN(e.target.value)}
          required
        />
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Preview: <span className="font-mono font-semibold text-[var(--text-dark)]">{preview}</span>
        </p>
      </div>
      {error && <p className="text-sm text-[var(--error)]">{error}</p>}
      {ok && <p className="text-sm text-[var(--success)]">{ok}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save start number"}
      </Button>
    </form>
  );
}
