import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDecode } = vi.hoisted(() => ({
  mockDecode: vi.fn(),
}));

vi.mock("next-auth/jwt", () => ({
  decode: mockDecode,
}));

import { verifySocketToken } from "@/server/realtime/socket-auth";

describe("Socket authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = "test-secret-minimum-32-characters-long";
  });

  it("verifies a valid WebSocket token", async () => {
    mockDecode.mockResolvedValue({ id: "user-123", name: "Test User" });

    const user = await verifySocketToken("valid-token");
    expect(user).toEqual({ userId: "user-123", userName: "Test User" });
    expect(mockDecode).toHaveBeenCalledWith({
      token: "valid-token",
      secret: process.env.AUTH_SECRET,
      salt: "collab-editor-ws",
    });
  });

  it("rejects invalid tokens", async () => {
    mockDecode.mockRejectedValue(new Error("invalid"));
    expect(await verifySocketToken("invalid-token")).toBeNull();
    expect(await verifySocketToken("")).toBeNull();
  });

  it("rejects tokens without user id", async () => {
    mockDecode.mockResolvedValue({ name: "No Id" });
    expect(await verifySocketToken("token")).toBeNull();
  });
});
