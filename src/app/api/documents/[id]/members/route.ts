import { auth } from "@/server/auth/auth";
import { authz, AuthorizationError } from "@/server/auth/authorization";
import { prisma } from "@/server/db/prisma";
import { apiError, apiSuccess, parseJsonBody } from "@/server/middleware/security";
import { addMemberSchema, MAX_PAYLOAD_BYTES } from "@/lib/validation/schemas";

/** List members (any reader). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return apiError("Unauthorized", 401);

  const { id: documentId } = await params;

  try {
    await authz.requirePermission(documentId, session.user.id, "read");
  } catch (err) {
    if (err instanceof AuthorizationError) return apiError(err.message, 403);
    throw err;
  }

  const members = await prisma.documentMember.findMany({
    where: { documentId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  return apiSuccess({ members });
}

/** Add or update a member role (OWNER only). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return apiError("Unauthorized", 401);

  const { id: documentId } = await params;

  try {
    await authz.requirePermission(documentId, session.user.id, "manage_members");
  } catch (err) {
    if (err instanceof AuthorizationError) return apiError(err.message, 403);
    throw err;
  }

  const { data, error } = await parseJsonBody(request, MAX_PAYLOAD_BYTES);
  if (error || !data) return apiError(error ?? "Invalid request", 400);

  const parsed = addMemberSchema.safeParse(data);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Validation failed", 400);
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });
  if (!user) return apiError("User not found", 404);

  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) return apiError("Not found", 404);
  if (user.id === document.ownerId) {
    return apiError("Owner role cannot be changed via members API", 400);
  }

  const member = await prisma.documentMember.upsert({
    where: {
      documentId_userId: { documentId, userId: user.id },
    },
    create: {
      documentId,
      userId: user.id,
      role: parsed.data.role,
    },
    update: { role: parsed.data.role },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  await prisma.activityLog.create({
    data: {
      documentId,
      userId: session.user.id,
      type: "MEMBER_ADDED",
      metadata: { memberId: user.id, role: parsed.data.role, email: user.email },
    },
  });

  return apiSuccess({ member });
}
