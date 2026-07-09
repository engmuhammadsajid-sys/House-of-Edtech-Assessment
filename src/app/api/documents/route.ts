import { auth } from "@/server/auth/auth";
import { prisma, withRlsContext } from "@/server/db/prisma";
import { apiError, apiSuccess, parseJsonBody, rateLimit } from "@/server/middleware/security";
import { createDocumentSchema, MAX_PAYLOAD_BYTES } from "@/lib/validation/schemas";
import type { DocumentRole } from "@prisma/client";

function resolveRole(
  userId: string,
  doc: { ownerId: string; members: { userId: string; role: DocumentRole }[] }
): DocumentRole {
  if (doc.ownerId === userId) return "OWNER";
  const membership = doc.members.find((m) => m.userId === userId);
  return membership?.role ?? "VIEWER";
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return apiError("Unauthorized", 401);

  const userId = session.user.id;

  const documents = await withRlsContext(userId, async (db) =>
    db.document.findMany({
      include: {
        owner: { select: { id: true, name: true } },
        members: {
          include: { user: { select: { id: true, name: true } } },
        },
        _count: { select: { operations: true, versions: true } },
      },
      orderBy: { updatedAt: "desc" },
    })
  );

  return apiSuccess({
    documents: documents.map((doc) => ({
      ...doc,
      role: resolveRole(userId, doc),
    })),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return apiError("Unauthorized", 401);

  const { allowed } = rateLimit(`doc-create:${session.user.id}`, 30, 60_000);
  if (!allowed) return apiError("Too many requests", 429);

  const { data, error } = await parseJsonBody(request, MAX_PAYLOAD_BYTES);
  if (error || !data) return apiError(error ?? "Invalid request", 400);

  const parsed = createDocumentSchema.safeParse(data);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Validation failed", 400);
  }

  const document = await prisma.document.create({
    data: {
      title: parsed.data.title,
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
    },
  });

  return apiSuccess({ document, role: "OWNER" as DocumentRole }, 201);
}
