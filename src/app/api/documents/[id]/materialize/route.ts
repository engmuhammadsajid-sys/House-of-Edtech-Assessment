import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db/prisma";
import { operationService } from "@/server/services/operation-service";
import { apiError, apiSuccess, parseJsonBody } from "@/server/middleware/security";
import { MAX_PAYLOAD_BYTES } from "@/lib/validation/schemas";
import { z } from "zod";

const materializeSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().max(500_000),
});

/** Create a server document from a locally cached offline document (same id). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return apiError("Unauthorized", 401);

  const { id } = await params;
  const { data, error } = await parseJsonBody(request, MAX_PAYLOAD_BYTES);
  if (error || !data) return apiError(error ?? "Invalid request", 400);

  const parsed = materializeSchema.safeParse(data);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Validation failed", 400);
  }

  const persistSnapshot = async () => {
    await operationService.clearOperations(id);
  };

  const existing = await prisma.document.findUnique({ where: { id } });
  if (existing) {
    if (existing.ownerId !== session.user.id) {
      return apiError("Forbidden", 403);
    }
    await persistSnapshot();
    const document = await prisma.document.update({
      where: { id },
      data: {
        title: parsed.data.title,
        content: parsed.data.content,
      },
    });
    return apiSuccess({ document, role: "OWNER" });
  }

  await persistSnapshot();

  const document = await prisma.document.create({
    data: {
      id,
      title: parsed.data.title,
      content: parsed.data.content,
      ownerId: session.user.id,
      tenantId: session.user.id,
      members: {
        create: { userId: session.user.id, role: "OWNER" },
      },
    },
  });

  await prisma.activityLog.create({
    data: {
      documentId: document.id,
      userId: session.user.id,
      type: "DOCUMENT_CREATED",
      metadata: { source: "offline-materialize" },
    },
  });

  return apiSuccess({ document, role: "OWNER" }, 201);
}
