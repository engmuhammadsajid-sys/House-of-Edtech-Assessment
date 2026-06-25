import { z } from "zod";

export const vectorClockSchema = z.record(z.string(), z.number().int().min(0));

export const operationSchema = z.object({
  id: z.string().min(1).max(128),
  documentId: z.string().min(1).max(128),
  userId: z.string().min(1).max(128),
  type: z.enum(["INSERT", "DELETE"]),
  position: z.number().int().min(0).max(10_000_000),
  content: z.string().max(100_000),
  length: z.number().int().min(0).max(100_000).default(0),
  timestamp: z.number().int().positive(),
  lamportTime: z.number().int().min(0),
  vectorClock: vectorClockSchema,
  clientId: z.string().min(1).max(256),
});

export const operationsBatchSchema = z.object({
  operations: z.array(operationSchema).min(1).max(50),
});

export const createDocumentSchema = z.object({
  title: z.string().min(1).max(200).trim(),
});

export const updateDocumentSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
});

export const createVersionSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  content: z.string().max(5_000_000),
});

export const restoreVersionSchema = z.object({
  versionId: z.string().min(1),
});

export const registerSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
});

export const aiActionSchema = z.object({
  action: z.enum([
    "summary",
    "rewrite",
    "improve",
    "meeting_notes",
    "action_items",
    "insights",
  ]),
  selectedText: z.string().max(100_000),
  documentId: z.string().min(1),
});

export const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["EDITOR", "VIEWER"]),
});

export const wsOperationSchema = z.object({
  type: z.literal("operation"),
  payload: operationSchema,
});

export const wsPresenceSchema = z.object({
  type: z.enum(["cursor", "typing", "presence"]),
  documentId: z.string(),
  cursor: z.number().int().min(0).optional(),
  isTyping: z.boolean().optional(),
});

export const MAX_PAYLOAD_BYTES = 512_000;
export const MAX_OPERATIONS_PER_MINUTE = 120;
export const MAX_DOCUMENT_SIZE = 5_000_000;
