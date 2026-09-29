export const ACCOUNT_CODE_PREFIX = "FLR";

/** Blank → null. Digits-only become FLR29. Otherwise compact + uppercase. */
export function normalizeAccountCode(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const compact = trimmed.replace(/\s+/g, "").toUpperCase();
  if (/^\d+$/.test(compact)) return `${ACCOUNT_CODE_PREFIX}${compact}`;
  return compact;
}

export function isValidAccountCode(code: string): boolean {
  return /^FLR\d+$/.test(code);
}

export function parseAccountCodeInput(raw: string | null | undefined): {
  ok: true;
  code: string | null;
} | { ok: false; error: string } {
  const code = normalizeAccountCode(raw);
  if (!code) return { ok: true, code: null };
  if (!isValidAccountCode(code)) {
    return { ok: false, error: "Account code must look like FLR29 (or enter 29)" };
  }
  return { ok: true, code };
}

export function formatAccountTitle(code: string | null | undefined, name: string): string {
  const c = code?.trim();
  if (!c) return name;
  return `${c} — ${name}`;
}

export function accountCodeMatchesQuery(
  code: string | null | undefined,
  rawQuery: string
): boolean {
  if (!code) return false;
  const needle = rawQuery.trim().toLowerCase().replace(/\s+/g, "");
  if (!needle) return false;
  return code.replace(/\s+/g, "").toLowerCase().includes(needle);
}

export function accountCodeDbError(message: string): string | null {
  if (/leads_company_account_code|account_code/i.test(message) && /duplicate|unique/i.test(message)) {
    return "That account code is already used on another file";
  }
  if (/Account code must look like/i.test(message)) {
    return "Account code must look like FLR29 (or enter 29)";
  }
  return null;
}
