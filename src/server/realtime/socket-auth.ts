import { decode } from "next-auth/jwt";
import type { Socket } from "socket.io";

export interface SocketUser {
  userId: string;
  userName: string;
}

/**
 * Verify socket connection using a short-lived JWT from /api/auth/ws-token.
 */
export async function verifySocketToken(token: string): Promise<SocketUser | null> {
  if (!token || !process.env.AUTH_SECRET) return null;

  try {
    const decoded = await decode({
      token,
      secret: process.env.AUTH_SECRET,
      salt: "collab-editor-ws",
    });
    if (!decoded?.id || typeof decoded.id !== "string") return null;
    return {
      userId: decoded.id,
      userName: typeof decoded.name === "string" ? decoded.name : "User",
    };
  } catch {
    return null;
  }
}

export async function authenticateSocket(socket: Socket): Promise<SocketUser | null> {
  const auth = socket.handshake.auth as { token?: string };
  if (!auth.token) return null;
  return verifySocketToken(auth.token);
}
