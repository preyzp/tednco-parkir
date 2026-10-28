// Indonesian (id-ID) money formatting: "." groups thousands, "," is the decimal
// separator. Rupiah amounts in this app are whole integers; storage is always a
// number, never a formatted string.
const idrNumber = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

/** 10000000 → "10.000.000" */
export function formatIdr(amount: number): string {
  return idrNumber.format(amount);
}
/** 10000000 → "Rp10.000.000" */
export function formatRupiah(amount: number): string {
  return `Rp${formatIdr(amount)}`;
}

// Max digits kept while typing: one more than Rp10.000.000 so an over-limit
// value stays visible (and invalid) instead of being cut silently.
const maxInputDigits = 9;

/** Strict parse of a Rupiah input: plain digits ("10000000") or correctly
 * grouped id-ID ("10.000.000"). Anything else — decimals ("1,5"), misplaced
 * dots ("5.00"), letters, signs, empty — is null, never reinterpreted. */
export function parseIdrInput(text: string): number | null {
  const value = text.trim();
  if (!/^\d+$/.test(value) && !/^\d{1,3}(\.\d{3})+$/.test(value)) return null;
  const amount = Number(value.replace(/\./g, ""));
  return Number.isSafeInteger(amount) ? amount : null;
}

/** Live formatting while typing: digits and dots are regrouped ("10000" →
 * "10.000", deleting a digit from "5.000" → "500"). Text with any other
 * character is returned unchanged so it stays visibly invalid. A paste is
 * parsed strictly: a malformed pasted value is kept as typed, not regrouped. */
export function formatIdrInput(text: string, { paste = false }: { paste?: boolean } = {}): string {
  if (!/^[\d.]*$/.test(text)) return text;
  if (paste && text !== "" && parseIdrInput(text) === null) return text;
  const digits = text.replace(/\./g, "").replace(/^0+(?=\d)/, "").slice(0, maxInputDigits);
  return digits === "" ? "" : formatIdr(Number(digits));
}

/** Caret position in `formatted` after the same number of digits that preceded
 * `caret` in `raw`, so regrouping does not make the cursor jump. */
export function caretAfterFormat(raw: string, caret: number, formatted: string): number {
  const digitsBefore = raw.slice(0, caret).replace(/\D/g, "").length;
  if (digitsBefore === 0) return 0;
  let seen = 0;
  for (let index = 0; index < formatted.length; index++) {
    if (/\d/.test(formatted[index])) seen++;
    if (seen === digitsBefore) return index + 1;
  }
  return formatted.length;
}
