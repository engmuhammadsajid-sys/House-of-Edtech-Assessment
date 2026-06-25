"use client";

import { use } from "react";
import { DocumentWorkspace } from "@/features/documents/document-workspace";

export default function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <DocumentWorkspace documentId={id} />;
}
