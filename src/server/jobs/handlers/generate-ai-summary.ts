import { db } from "~/server/jobs/db";
import { generateTopLevelSummary, generateFreeTextSummary } from "~/server/ai/summaries";
import { isAiConfigured } from "~/server/ai/service";

export async function handleGenerateAiSummary(payload: {
  surveyId: string;
  focusPrompt?: string;
  questionId?: string;
}) {
  if (!isAiConfigured()) {
    console.log("[handleGenerateAiSummary] GEMINI_API_KEY not configured — skipping");
    return;
  }

  const survey = await db.survey.findUnique({
    where: { id: payload.surveyId },
    include: {
      questions: {
        include: { answers: true },
        orderBy: { position: "asc" },
      },
    },
  });

  if (!survey) throw new Error(`Survey ${payload.surveyId} not found`);

  const totalResponses = await db.response.count({
    where: { surveyId: survey.id, status: "SUBMITTED", deletedAt: null },
  });

  if (totalResponses === 0) return; // Skip if no responses

  if (payload.questionId) {
    // Regenerate single question summary
    const question = survey.questions.find((q) => q.id === payload.questionId);
    if (!question || question.questionType !== "FREE_TEXT") return;

    const content = await generateFreeTextSummary(question, survey.title, payload.focusPrompt);
    await db.aiSummary.upsert({
      where: { surveyId_questionId: { surveyId: survey.id, questionId: question.id } },
      update: { content, focusPrompt: payload.focusPrompt ?? null, generatedAt: new Date() },
      create: { surveyId: survey.id, questionId: question.id, content, focusPrompt: payload.focusPrompt ?? null },
    });
  } else {
    // Generate all summaries (top-level + per-free-text)
    const context = {
      title: survey.title,
      description: survey.description,
      questions: survey.questions,
      totalResponses,
    };

    // Top-level summary (questionId = null)
    const topContent = await generateTopLevelSummary(context, payload.focusPrompt);
    // For top-level (questionId = null), we use findFirst + update/create due to partial unique index
    const existing = await db.aiSummary.findFirst({
      where: { surveyId: survey.id, questionId: null },
    });
    if (existing) {
      await db.aiSummary.update({
        where: { id: existing.id },
        data: { content: topContent, focusPrompt: payload.focusPrompt ?? null, generatedAt: new Date() },
      });
    } else {
      await db.aiSummary.create({
        data: { surveyId: survey.id, questionId: null, content: topContent, focusPrompt: payload.focusPrompt ?? null },
      });
    }

    // Per-free-text question summaries
    const freeTextQuestions = survey.questions.filter((q) => q.questionType === "FREE_TEXT");
    for (const question of freeTextQuestions) {
      const content = await generateFreeTextSummary(question, survey.title);
      await db.aiSummary.upsert({
        where: { surveyId_questionId: { surveyId: survey.id, questionId: question.id } },
        update: { content, generatedAt: new Date() },
        create: { surveyId: survey.id, questionId: question.id, content },
      });
    }
  }
}
