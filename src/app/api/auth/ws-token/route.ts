import { encode } from "next-auth/jwt";
import { auth } from "@/server/auth/auth";
import { apiError, apiSuccess } from "@/server/middleware/security";

/** Issue a short-lived JWT for WebSocket authentication. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return apiError("Unauthorized", 401);

  const token = await encode({
    token: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    },
    secret: process.env.AUTH_SECRET!,
    salt: "collab-editor-ws",
    maxAge: 60 * 5,
  });

  return apiSuccess({ token });
}
