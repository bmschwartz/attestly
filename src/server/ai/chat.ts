import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "~/env";
import type { Question, Answer } from "~/generated/prisma";

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
const chatModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

interface SurveyData {
  title: string;
  description: string;
  totalResponses: number;
  questions: (Question & { answers: Answer[] })[];
}

function buildContext(surveys: SurveyData[]): string {
  return surveys
    .map((s) => {
      const questionData = s.questions.map((q) => {
        const answers = q.answers;
        const summary: Record<string, unknown> = {
          text: q.text,
          type: q.questionType,
          responseCount: answers.length,
        };

        if (q.questionType === "RATING") {
          const nums = answers.map((a) => parseFloat(a.value)).filter((n) => !isNaN(n));
          summary.average = nums.length > 0 ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : 0;
        }

        if (q.questionType === "SINGLE_SELECT" || q.questionType === "MULTIPLE_CHOICE" || q.questionType === "RATING") {
          const dist: Record<string, number> = {};
          for (const a of answers) {
            dist[a.value] = (dist[a.value] ?? 0) + 1;
          }
          summary.distribution = dist;
        }

        if (q.questionType === "FREE_TEXT") {
          // Context management: include up to 500 responses
          const texts = answers.slice(0, 500).map((a) => a.value);
          summary.responses = texts;
          if (answers.length > 500) {
            summary.note = `Showing 500 of ${answers.length} responses`;
          }
        }

        return summary;
      });

      return `## Survey: ${s.title}\nDescription: ${s.description}\nTotal responses: ${s.totalResponses}\n\n${JSON.stringify(questionData, null, 2)}`;
    })
    .join("\n\n---\n\n");
}

export async function chatWithData(
  surveys: SurveyData[],
  messages: { role: "user" | "assistant"; content: string }[],
  newMessage: string,
): Promise<string> {
  const context = buildContext(surveys);

  const systemPrompt = `You are an AI analyst helping a survey creator understand their survey results. You have access to the complete survey data below. Answer questions based ONLY on this data. If asked something unrelated to the survey data, respond: "I can only answer questions about this survey's data."

${context}`;

  const history = messages.map((m) => ({
    role: m.role === "user" ? "user" as const : "model" as const,
    parts: [{ text: m.content }],
  }));

  const chat = chatModel.startChat({
    history,
    systemInstruction: systemPrompt,
  });

  const result = await chat.sendMessage(newMessage);
  return result.response.text();
}
