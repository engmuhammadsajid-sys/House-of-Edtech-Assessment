import { auth } from "@/server/auth/auth";
import { authz } from "@/server/auth/authorization";
import { snapshotService } from "@/server/services/version-service";
import { apiError, apiSuccess } from "@/server/middleware/security";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return apiError("Unauthorized", 401);

  const url = new URL(request.url);
  const versionA = url.searchParams.get("a");
  const versionB = url.searchParams.get("b");

  if (!versionA || !versionB) return apiError("Missing version IDs", 400);

  try {
    const comparison = await snapshotService.compare(versionA, versionB);
    const access = await authz.getDocumentAccess(comparison.versionA.documentId, session.user.id);
    if (!access) return apiError("Not found", 404);

    return apiSuccess({ comparison });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Compare failed", 400);
  }
}
