import { auth } from "@/server/auth/auth";
import { authz, AuthorizationError } from "@/server/auth/authorization";
import { operationService } from "@/server/services/operation-service";
import {
  operationsBatchSchema,
  MAX_OPERATIONS_PER_MINUTE,
  MAX_PAYLOAD_BYTES,
} from "@/lib/validation/schemas";
import {
  apiError,
  apiSuccess,
  parseJsonBody,
  rateLimit,
} from "@/server/middleware/security";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return apiError("Unauthorized", 401);

  const { id: documentId } = await params;

  const { allowed } = rateLimit(
    `sync-push:${session.user.id}:${documentId}`,
    MAX_OPERATIONS_PER_MINUTE,
    60_000
  );
  if (!allowed) return apiError("Rate limit exceeded", 429);

  const { data, error } = await parseJsonBody(request, MAX_PAYLOAD_BYTES);
  if (error || !data) return apiError(error ?? "Invalid request", 400);

  const parsed = operationsBatchSchema.safeParse(data);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Validation failed", 400);
  }

  for (const op of parsed.data.operations) {
    if (op.documentId !== documentId) {
      return apiError("Document ID mismatch", 400);
    }
  }

  try {
    const access = await authz.requireSync(documentId, session.user.id);
    await authz.assertDocumentTenant(access);

    const acknowledged = await operationService.pushOperations(
      documentId,
      access.tenantId,
      session.user.id,
      parsed.data.operations
    );

    return apiSuccess({ operations: acknowledged });
  } catch (err) {
    if (err instanceof AuthorizationError) return apiError(err.message, 403);
    throw err;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return apiError("Unauthorized", 401);

  const { id: documentId } = await params;

  try {
    const access = await authz.requireSync(documentId, session.user.id);
    await authz.assertDocumentTenant(access);

    const since = Number(new URL(request.url).searchParams.get("since") ?? 0);
    const operations = await operationService.pullOperations(
      documentId,
      access.tenantId,
      since || undefined
    );

    return apiSuccess({ operations });
  } catch (err) {
    if (err instanceof AuthorizationError) return apiError(err.message, 403);
    throw err;
  }
}
