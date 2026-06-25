import { auth } from "@/server/auth/auth";
import { authz, AuthorizationError } from "@/server/auth/authorization";
import { deadLetterService } from "@/server/services/dead-letter-service";
import { operationsBatchSchema } from "@/lib/validation/schemas";
import { apiError, apiSuccess, parseJsonBody, rateLimit } from "@/server/middleware/security";
import { MAX_PAYLOAD_BYTES } from "@/lib/validation/schemas";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return apiError("Unauthorized", 401);

  const { id: documentId } = await params;

  try {
    await authz.requireSync(documentId, session.user.id);
    const entries = await deadLetterService.list(documentId);
    return apiSuccess({ entries });
  } catch (err) {
    if (err instanceof AuthorizationError) return apiError(err.message, 403);
    throw err;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return apiError("Unauthorized", 401);

  const { id: documentId } = await params;
  const { allowed } = rateLimit(`dlq:${session.user.id}`, 30, 60_000);
  if (!allowed) return apiError("Too many requests", 429);

  const { data, error } = await parseJsonBody(request, MAX_PAYLOAD_BYTES);
  if (error || !data) return apiError(error ?? "Invalid request", 400);

  const body = data as { action?: string; deadLetterId?: string; operation?: unknown; operationId?: string; lastError?: string };

  try {
    await authz.requireSync(documentId, session.user.id);

    if (body.action === "retry" && body.deadLetterId) {
      const ops = await deadLetterService.retry(body.deadLetterId, session.user.id);
      return apiSuccess({ operations: ops });
    }

    if (body.operation && body.operationId) {
      const parsed = operationsBatchSchema.safeParse({ operations: [body.operation] });
      if (!parsed.success) return apiError("Invalid operation payload", 400);
      const entry = await deadLetterService.enqueue(
        documentId,
        body.operationId,
        parsed.data.operations[0],
        body.lastError ?? "Sync failed"
      );
      return apiSuccess({ entry }, 201);
    }

    return apiError("Invalid action", 400);
  } catch (err) {
    if (err instanceof AuthorizationError) return apiError(err.message, 403);
    return apiError(err instanceof Error ? err.message : "DLQ operation failed", 400);
  }
}
