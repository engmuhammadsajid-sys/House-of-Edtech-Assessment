import { auth } from "@/server/auth/auth";
import { authz } from "@/server/auth/authorization";
import { prisma } from "@/server/db/prisma";
import { operationService } from "@/server/services/operation-service";
import { apiError, apiSuccess } from "@/server/middleware/security";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return apiError("Unauthorized", 401);

  const { id } = await params;
  const access = await authz.getDocumentAccess(id, session.user.id);
  if (!access) return apiError("Not found", 404);

  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });

  if (!document) return apiError("Not found", 404);

  const content = await operationService.ensureDocumentContent(id);

  return apiSuccess({
    document: { ...document, content },
    role: access.role,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return apiError("Unauthorized", 401);

  const { id } = await params;

  try {
    await authz.requirePermission(id, session.user.id, "delete");
    await prisma.document.delete({ where: { id } });
    return apiSuccess({ deleted: true });
  } catch {
    return apiError("Forbidden", 403);
  }
}
