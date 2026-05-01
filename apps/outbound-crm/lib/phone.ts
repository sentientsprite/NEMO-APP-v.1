/**
 * Normalize phone for dedupe + `tel:` links.
 * US-centric: 10 digits → +1…, 11 starting with 1 → +1…
 */
export function normalizePhone(input: string): string {
  const raw = input.trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.startsWith("+") && digits.length) return `+${digits}`;
  if (digits.length) return `+${digits}`;
  return "";
}

export function telHref(phoneNormalized: string): string {
  const n = phoneNormalized.replace(/\D/g, "");
  return n ? `tel:${phoneNormalized}` : "#";
}
