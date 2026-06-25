/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { createServer, type Server as HttpServer } from "http";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";

const mockGetDocumentAccess = vi.fn();

vi.mock("@/server/realtime/socket-auth", () => ({
  authenticateSocket: vi.fn(async (socket: { handshake: { auth: { userId?: string } } }) => {
    const userId = socket.handshake.auth.userId;
    if (!userId) return null;
    return { userId, userName: `User ${userId}` };
  }),
}));

vi.mock("@/server/realtime/redis-adapter", () => ({
  attachRedisAdapter: vi.fn(),
}));

vi.mock("@/server/auth/authorization", () => ({
  authz: {
    getDocumentAccess: (...args: unknown[]) => mockGetDocumentAccess(...args),
  },
}));

import { initSocketServer } from "@/server/realtime/socket-server";

function makeOperation(userId: string) {
  return {
    id: "op-ws-1",
    documentId: "doc-ws",
    userId,
    type: "INSERT" as const,
    position: 0,
    content: "live",
    length: 0,
    timestamp: Date.now(),
    lamportTime: 1,
    vectorClock: { [userId]: 1 },
    clientId: "client-ws-1",
  };
}

describe("Socket server broadcast path", () => {
  let httpServer: HttpServer;
  let port: number;
  let clientA: ClientSocket;
  let clientB: ClientSocket;

  beforeAll(async () => {
    httpServer = createServer();
    await initSocketServer(httpServer);
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        port = typeof addr === "object" && addr ? addr.port : 0;
        resolve();
      });
    });

    mockGetDocumentAccess.mockResolvedValue({
      documentId: "doc-ws",
      userId: "user-a",
      role: "EDITOR",
      tenantId: "tenant-1",
    });

    clientA = ioClient(`http://localhost:${port}`, {
      path: "/api/socketio",
      auth: { userId: "user-a" },
      transports: ["websocket"],
    });
    clientB = ioClient(`http://localhost:${port}`, {
      path: "/api/socketio",
      auth: { userId: "user-b" },
      transports: ["websocket"],
    });

    await Promise.all([
      new Promise<void>((r) => clientA.on("connect", () => r())),
      new Promise<void>((r) => clientB.on("connect", () => r())),
    ]);

    clientA.emit("join-document", { documentId: "doc-ws", color: "#ff0000" });
    clientB.emit("join-document", { documentId: "doc-ws", color: "#00ff00" });
    await new Promise((r) => setTimeout(r, 50));
  });

  afterAll(async () => {
    clientA.close();
    clientB.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it("relays operation from editor to collaborator as remote-operation", async () => {
    const op = makeOperation("user-a");
    const received = new Promise<typeof op>((resolve) => {
      clientB.on("remote-operation", (payload) => resolve(payload));
    });

    clientA.emit("operation", op);
    const remote = await received;

    expect(remote.id).toBe(op.id);
    expect(remote.content).toBe("live");
    expect(remote.userId).toBe("user-a");
  });
});
