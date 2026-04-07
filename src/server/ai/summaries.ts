import { generateText } from "./service";
import type { Question, Answer } from "~/generated/prisma";

interface SurveyContext {
  title: string;
  description: string;
  questions: (Question & { answers: Answer[] })[];
  totalResponses: number;
}

export async function generateTopLevelSummary(
  context: SurveyContext,
  focusPrompt?: string,
): Promise<string> {
  const aggregatedData = context.questions.map((q) => ({
    text: q.text,
    type: q.questionType,
    responseCount: q.answers.length,
    ...(q.questionType === "SINGLE_SELECT" || q.questionType === "MULTIPLE_CHOICE"
      ? { distribution: getDistribution(q.answers) }
      : {}),
    ...(q.questionType === "RATING"
      ? { average: getAverage(q.answers), distribution: getDistribution(q.answers) }
      : {}),
    ...(q.questionType === "FREE_TEXT"
      ? { sampleResponses: q.answers.slice(0, 50).map((a) => a.value) }
      : {}),
  }));

  const prompt = `You are analyzing survey results for "${context.title}".

Survey description: ${context.description}
Total responses: ${context.totalResponses}

Survey data:
${JSON.stringify(aggregatedData, null, 2)}

${focusPrompt ? `Focus your analysis on: ${focusPrompt}` : ""}

Provide a concise summary with:
- Key findings (3-5 bullet points)
- Overall sentiment assessment
- Notable patterns or correlations across questions
- Surprises or outliers

Format as markdown. Be specific and data-driven.`;

  return generateText(prompt);
}

export async function generateFreeTextSummary(
  question: Question & { answers: Answer[] },
  surveyTitle: string,
  focusPrompt?: string,
): Promise<string> {
  const responses = question.answers.map((a) => a.value);

  const prompt = `You are analyzing free-text responses to a survey question.

Survey: "${surveyTitle}"
Question: "${question.text}"
Total responses: ${responses.length}

Responses:
${responses.slice(0, 500).map((r, i) => `${i + 1}. ${r}`).join("\n")}
${responses.length > 500 ? `\n... and ${responses.length - 500} more responses` : ""}

${focusPrompt ? `Focus your analysis on: ${focusPrompt}` : ""}

Provide a concise summary with:
- Top themes with approximate frequency
- Sentiment breakdown
- Notable patterns

Format as markdown. Be specific.`;

  return generateText(prompt);
}

function getDistribution(answers: Answer[]): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const a of answers) {
    dist[a.value] = (dist[a.value] ?? 0) + 1;
  }
  return dist;
}

function getAverage(answers: Answer[]): number {
  const nums = answers.map((a) => parseFloat(a.value)).filter((n) => !isNaN(n));
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}
