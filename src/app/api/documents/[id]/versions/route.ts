import { auth } from "@/server/auth/auth";
import { authz, AuthorizationError } from "@/server/auth/authorization";
import { versionService, restoreService } from "@/server/services/version-service";
import { createVersionSchema, MAX_PAYLOAD_BYTES } from "@/lib/validation/schemas";
import { apiError, apiSuccess, parseJsonBody, rateLimit } from "@/server/middleware/security";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return apiError("Unauthorized", 401);

  const { id: documentId } = await params;
  const access = await authz.getDocumentAccess(documentId, session.user.id);
  if (!access) return apiError("Not found", 404);

  const versions = await versionService.listVersions(documentId);
  return apiSuccess({ versions });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return apiError("Unauthorized", 401);

  const { id: documentId } = await params;
  const { allowed } = rateLimit(`version:${session.user.id}`, 20, 60_000);
  if (!allowed) return apiError("Too many requests", 429);

  const { data, error } = await parseJsonBody(request, MAX_PAYLOAD_BYTES);
  if (error || !data) return apiError(error ?? "Invalid request", 400);

  const body = data as { action?: string; versionId?: string; name?: string; content?: string };

  if (body.action === "restore" && body.versionId) {
    try {
      await authz.requirePermission(documentId, session.user.id, "restore_version");
      const restored = await restoreService.restore(documentId, body.versionId, session.user.id);
      return apiSuccess({ version: restored });
    } catch (err) {
      if (err instanceof AuthorizationError) return apiError(err.message, 403);
      return apiError(err instanceof Error ? err.message : "Restore failed", 400);
    }
  }

  const parsed = createVersionSchema.safeParse(data);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Validation failed", 400);
  }

  try {
    await authz.requirePermission(documentId, session.user.id, "create_version");
    const version = await versionService.createSnapshot(
      documentId,
      session.user.id,
      parsed.data.name,
      parsed.data.content
    );
    return apiSuccess({ version }, 201);
  } catch (err) {
    if (err instanceof AuthorizationError) return apiError(err.message, 403);
    throw err;
  }
}
