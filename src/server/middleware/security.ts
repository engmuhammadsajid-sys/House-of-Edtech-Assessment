import { NextResponse } from "next/server";

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count };
}

export function checkPayloadSize(body: string, maxBytes: number): boolean {
  return new TextEncoder().encode(body).length <= maxBytes;
}

export function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export async function parseJsonBody<T>(
  request: Request,
  maxBytes: number
): Promise<{ data: T | null; error: string | null }> {
  try {
    const text = await request.text();
    if (!checkPayloadSize(text, maxBytes)) {
      return { data: null, error: "Payload too large" };
    }
    const data = JSON.parse(text) as T;
    return { data, error: null };
  } catch {
    return { data: null, error: "Invalid JSON" };
  }
}
