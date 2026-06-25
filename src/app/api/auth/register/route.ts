import { auth } from "@/server/auth/auth";
import { registerUser } from "@/server/auth/auth";
import { registerSchema } from "@/lib/validation/schemas";
import { apiError, apiSuccess, parseJsonBody, rateLimit } from "@/server/middleware/security";
import { MAX_PAYLOAD_BYTES } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const { allowed } = rateLimit(`register:${ip}`, 5, 60_000);
  if (!allowed) return apiError("Too many requests", 429);

  const { data, error } = await parseJsonBody(request, MAX_PAYLOAD_BYTES);
  if (error || !data) return apiError(error ?? "Invalid request", 400);

  const parsed = registerSchema.safeParse(data);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Validation failed", 400);
  }

  try {
    const user = await registerUser(parsed.data);
    return apiSuccess({ id: user.id, email: user.email, name: user.name }, 201);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Registration failed", 400);
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return apiError("Unauthorized", 401);
  return apiSuccess({ user: session.user });
}
