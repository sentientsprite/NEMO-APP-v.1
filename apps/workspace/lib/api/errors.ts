import { NextResponse } from "next/server";
import type { ZodError, ZodSchema } from "zod";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function zodValidationError(error: ZodError) {
  const first = error.issues[0];
  const message = first?.message ?? "Invalid request";
  return NextResponse.json(
    {
      error: message,
      details: error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    },
    { status: 400 },
  );
}

export async function parseJsonBody<T>(
  request: Request,
  schema: ZodSchema<T>,
): Promise<{ data: T } | { error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { error: jsonError("Invalid JSON body", 400) };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { error: zodValidationError(parsed.error) };
  }
  return { data: parsed.data };
}

export function parseSearchParams<T>(
  searchParams: URLSearchParams,
  schema: ZodSchema<T>,
): { data: T } | { error: NextResponse } {
  const raw = Object.fromEntries(searchParams.entries());
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { error: zodValidationError(parsed.error) };
  }
  return { data: parsed.data };
}
