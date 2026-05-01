import { timingSafeEqual } from "crypto";

export function bearerMatchesSecret(headerValue: string | null, secret: string): boolean {
  if (!headerValue?.startsWith("Bearer ")) return false;
  const token = headerValue.slice(7);
  if (!secret || token.length !== secret.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
  } catch {
    return false;
  }
}
