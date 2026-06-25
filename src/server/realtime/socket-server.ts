import type { Server as HTTPServer } from "http";
import type { Socket } from "socket.io";
import { Server } from "socket.io";
import { wsPresenceSchema, operationSchema } from "@/lib/validation/schemas";
import type { PresenceUser } from "@/types/operation";
import { authenticateSocket } from "./socket-auth";
import { attachRedisAdapter } from "./redis-adapter";
import { authz } from "@/server/auth/authorization";
import { canSync } from "@/server/auth/rbac";
import type { DocumentRole } from "@prisma/client";

interface DocumentRoom {
  users: Map<string, PresenceUser>;
}

const documentRooms = new Map<string, DocumentRoom>();

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    userName: string;
    documentRoles: Map<string, DocumentRole>;
  };
}

export async function initSocketServer(httpServer: HTTPServer) {
  const io = new Server(httpServer, {
    path: "/api/socketio",
    cors: { origin: process.env.NEXTAUTH_URL ?? "http://localhost:3000" },
    maxHttpBufferSize: 512_000,
  });

  await attachRedisAdapter(io);

  io.use(async (socket, next) => {
    const user = await authenticateSocket(socket);
    if (!user) {
      next(new Error("Unauthorized"));
      return;
    }
    const authSocket = socket as AuthenticatedSocket;
    authSocket.data.userId = user.userId;
    authSocket.data.userName = user.userName;
    authSocket.data.documentRoles = new Map();
    next();
  });

  io.on("connection", (socket: Socket) => {
    const authSocket = socket as AuthenticatedSocket;
    const userId = authSocket.data.userId;
    const userName = authSocket.data.userName;

    socket.on("join-document", async (data: { documentId: string; color: string }) => {
      const { documentId, color } = data;
      if (!documentId) return;

      const access = await authz.getDocumentAccess(documentId, userId);
      if (!access) {
        socket.emit("error", { message: "Forbidden" });
        return;
      }

      authSocket.data.documentRoles.set(documentId, access.role);
      socket.join(documentId);

      if (!documentRooms.has(documentId)) {
        documentRooms.set(documentId, { users: new Map() });
      }

      const room = documentRooms.get(documentId)!;
      room.users.set(userId, {
        userId,
        name: userName,
        color,
        lastSeen: Date.now(),
      });

      io.to(documentId).emit("presence-update", Array.from(room.users.values()));
    });

    socket.on("leave-document", (data: { documentId: string }) => {
      socket.leave(data.documentId);
      authSocket.data.documentRoles.delete(data.documentId);
      const room = documentRooms.get(data.documentId);
      if (room) {
        room.users.delete(userId);
        io.to(data.documentId).emit("presence-update", Array.from(room.users.values()));
      }
    });

    socket.on("presence", (data: unknown) => {
      const parsed = wsPresenceSchema.safeParse(data);
      if (!parsed.success) return;

      const room = documentRooms.get(parsed.data.documentId);
      if (!room) return;

      const user = room.users.get(userId);
      if (!user) return;

      if (parsed.data.cursor !== undefined) user.cursor = parsed.data.cursor;
      if (parsed.data.isTyping !== undefined) user.isTyping = parsed.data.isTyping;
      user.lastSeen = Date.now();

      socket.to(parsed.data.documentId).emit("presence-update", Array.from(room.users.values()));
    });

    socket.on("operation", async (data: unknown) => {
      const parsed = operationSchema.safeParse(
        (data as { payload?: unknown })?.payload ?? data
      );
      if (!parsed.success) return;

      if (parsed.data.userId !== userId) return;

      const role = authSocket.data.documentRoles.get(parsed.data.documentId);
      if (!role || !canSync(role)) return;

      const access = await authz.getDocumentAccess(parsed.data.documentId, userId);
      if (!access || !canSync(access.role)) return;

      socket.to(parsed.data.documentId).emit("remote-operation", parsed.data);
    });

    socket.on("disconnect", () => {
      for (const [documentId, room] of documentRooms) {
        if (room.users.has(userId)) {
          room.users.delete(userId);
          io.to(documentId).emit("presence-update", Array.from(room.users.values()));
        }
      }
    });
  });

  return io;
}
