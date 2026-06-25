import { auth } from "@/server/auth/auth";
import { authz, AuthorizationError } from "@/server/auth/authorization";
import { aiService } from "@/server/services/ai-service";
import { aiActionSchema, MAX_PAYLOAD_BYTES } from "@/lib/validation/schemas";
import { apiError, apiSuccess, parseJsonBody, rateLimit } from "@/server/middleware/security";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return apiError("Unauthorized", 401);

  const { allowed } = rateLimit(`ai:${session.user.id}`, 10, 60_000);
  if (!allowed) return apiError("AI rate limit exceeded", 429);

  const { data, error } = await parseJsonBody(request, MAX_PAYLOAD_BYTES);
  if (error || !data) return apiError(error ?? "Invalid request", 400);

  const parsed = aiActionSchema.safeParse(data);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Validation failed", 400);
  }

  try {
    await authz.requirePermission(parsed.data.documentId, session.user.id, "ai");
    const result = await aiService.execute(
      parsed.data.action,
      parsed.data.selectedText,
      parsed.data.documentId,
      session.user.id
    );
    return apiSuccess(result);
  } catch (err) {
    if (err instanceof AuthorizationError) return apiError(err.message, 403);
    return apiError("AI processing failed", 500);
  }
}
