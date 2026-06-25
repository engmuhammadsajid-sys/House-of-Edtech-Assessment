import { versionService } from "./version-service";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const PROMPTS: Record<string, string> = {
  summary:
    "Summarize the following text concisely. Return only the summary with no preamble or commentary:\n\n",
  rewrite:
    "Rewrite the following text while preserving meaning. Return only the rewritten text with no preamble, alternatives, or commentary:\n\n",
  improve:
    "Improve the writing quality of the following text. Return only the improved text with no preamble, alternatives, or commentary:\n\n",
  meeting_notes:
    "Convert the following into structured meeting notes. Return only the notes:\n\n",
  action_items:
    "Extract action items from the following text as a bullet list. Return only the list:\n\n",
  insights:
    "Provide key insights and analysis of the following text. Return only the insights:\n\n",
};

const SYSTEM_PROMPT =
  "You are a document editing assistant. Follow the user instruction exactly. Output only the requested result—no labels like 'Improved version:', no multiple options, and no extra explanation.";

function getGroqApiKey(): string | undefined {
  return process.env.GROQ_API_KEY;
}

async function callGroq(prompt: string): Promise<string> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error("Groq API key not configured");
  }

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      max_tokens: 2000,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Groq API error (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return data.choices?.[0]?.message?.content ?? "";
}

export class AIService {
  async execute(
    action: string,
    selectedText: string,
    documentId: string,
    userId: string
  ): Promise<{ result: string; versionId: string }> {
    if (!getGroqApiKey()) {
      const mock = `[AI ${action}] Processed ${selectedText.length} characters. Configure GROQ_API_KEY for live results.`;
      const version = await versionService.createSnapshot(
        documentId,
        userId,
        `AI: ${action}`,
        selectedText,
        { action, aiGenerated: true, result: mock }
      );
      return { result: mock, versionId: version.id };
    }

    const prompt = (PROMPTS[action] ?? PROMPTS.summary) + selectedText;
    const result = await callGroq(prompt);

    const version = await versionService.createSnapshot(
      documentId,
      userId,
      `AI: ${action}`,
      selectedText,
      { action, aiGenerated: true, result }
    );

    return { result, versionId: version.id };
  }
}

export const aiService = new AIService();
