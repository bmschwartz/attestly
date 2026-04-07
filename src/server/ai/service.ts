import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "~/env";

let summaryModel: ReturnType<
  InstanceType<typeof GoogleGenerativeAI>["getGenerativeModel"]
> | null = null;

if (env.GEMINI_API_KEY) {
  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  summaryModel = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-lite",
  });
}

export async function generateText(prompt: string): Promise<string> {
  if (!summaryModel) {
    throw new Error("GEMINI_API_KEY is not configured — AI generation skipped");
  }
  const result = await summaryModel.generateContent(prompt);
  return result.response.text();
}

export async function generateStreamingText(
  prompt: string,
): Promise<AsyncGenerator<string>> {
  if (!summaryModel) {
    throw new Error("GEMINI_API_KEY is not configured — AI generation skipped");
  }
  const result = await summaryModel.generateContentStream(prompt);
  async function* stream() {
    for await (const chunk of result.stream) {
      yield chunk.text();
    }
  }
  return stream();
}

export function isAiConfigured(): boolean {
  return summaryModel !== null;
}
