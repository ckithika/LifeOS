/**
 * Gemini AI provider for LifeOS messaging channels.
 *
 * Uses @google/generative-ai SDK with function calling.
 * Primary provider — Gemini Flash free tier (1,500 req/day).
 */

import {
  GoogleGenAI,
  type Content,
  type Part,
  type FunctionDeclaration,
  type GenerateContentResponse,
  Type,
} from '@google/genai';
import { type ToolParam, toGeminiTools, executeTool } from './tools.js';
import {
  getConversation,
  saveConversation,
  toGeminiHistory,
} from './memory.js';
import { getSystemPrompt } from './claude.js';

// ─── SDK ──────────────────────────────────────────────────────

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_AI_API_KEY is not set');
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

function getModel(): string {
  return process.env.GEMINI_MODEL || 'gemini-2.5-flash';
}

// ─── Agentic Loop ─────────────────────────────────────────────

export async function chatWithGemini(
  userMessage: string,
  chatId: string | undefined,
  tools: ToolParam[],
  channelName = 'Telegram',
): Promise<string> {
  const ai = getClient();
  const model = getModel();
  const cid = chatId || 'default';

  // Build conversation history
  const history = getConversation(cid);
  const geminiHistory = toGeminiHistory(history);

  // Convert tools to Gemini function declarations
  const geminiToolDefs = toGeminiTools(tools);
  const functionDeclarations: FunctionDeclaration[] = geminiToolDefs.map(t => ({
    name: t.name,
    description: t.description,
    parameters: {
      type: Type.OBJECT,
      properties: t.parameters.properties as Record<string, any>,
      required: t.parameters.required,
    },
  }));

  // Build contents: history + user message
  const contents: Content[] = [
    ...geminiHistory,
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  // Agentic loop
  for (let i = 0; i < 10; i++) {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: getSystemPrompt(channelName),
        tools: [{ functionDeclarations }],
      },
    });

    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts) {
      break;
    }

    const parts = candidate.content.parts;

    // Check for function calls
    const functionCalls = parts.filter(p => p.functionCall);

    if (functionCalls.length === 0) {
      // No function calls — extract text response
      const text = parts
        .filter(p => p.text)
        .map(p => p.text)
        .join('');
      const reply = text || 'No response generated.';

      saveConversation(cid, [
        ...history,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: reply },
      ]);

      return reply;
    }

    // Add model response to contents
    contents.push({ role: 'model', parts });

    // Execute each function call and collect responses
    const responseParts: Part[] = [];
    for (const part of functionCalls) {
      const fc = part.functionCall!;
      const result = await executeTool(fc.name!, (fc.args as Record<string, unknown>) ?? {});

      let parsed: unknown;
      try {
        parsed = JSON.parse(result);
      } catch {
        parsed = { result };
      }

      responseParts.push({
        functionResponse: {
          name: fc.name!,
          response: parsed as Record<string, unknown>,
        },
      });
    }

    // Add function responses to contents
    contents.push({ role: 'user', parts: responseParts });
  }

  // Hit iteration limit
  saveConversation(cid, [
    ...history,
    { role: 'user', content: userMessage },
    { role: 'assistant', content: 'I ran into a limit processing your request.' },
  ]);
  return 'I ran into a limit processing your request. Try a simpler question.';
}
