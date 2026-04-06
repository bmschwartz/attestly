# AI Summaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement AI summary generation on survey close and display on the results page.

**Architecture:** Provider-agnostic AI service layer with Gemini Flash-Lite as the initial implementation. Summaries generated asynchronously via BackgroundJob queue on survey close. Stored in AiSummary table for instant page load. Top-level summary + per-free-text-question summaries.

**Tech Stack:** Google Generative AI SDK (@google/generative-ai), tRPC 11, Prisma 7

**Spec reference:** `docs/superpowers/specs/2026-04-05-ai-insights-design.md`

---

### Task 1: Install Google AI SDK and configure env

**Files:**
- Modify: `package.json`
- Modify: `src/env.js`

- [ ] **Step 1: Install the SDK**

Run: `pnpm add @google/generative-ai`

- [ ] **Step 2: Add GEMINI_API_KEY to env validation**

In `src/env.js`, add to the server schema:
```javascript
GEMINI_API_KEY: z.string().min(1),
```

Add to `runtimeEnv`:
```javascript
GEMINI_API_KEY: process.env.GEMINI_API_KEY,
```

- [ ] **Step 3: Add to .env**

```
GEMINI_API_KEY=your-gemini-api-key-here
```

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/env.js
git commit -m "feat: install Google AI SDK and add GEMINI_API_KEY env var"
```

---

### Task 2: Create AI service layer

**Files:**
- Create: `src/server/ai/service.ts`

- [ ] **Step 1: Create the provider-agnostic AI service**

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "~/env";

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

const summaryModel = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-lite",
});

export async function generateText(prompt: string): Promise<string> {
  const result = await summaryModel.generateContent(prompt);
  return result.response.text();
}

export async function generateStreamingText(
  prompt: string,
): AsyncGenerator<string> {
  const result = await summaryModel.generateContentStream(prompt);
  async function* stream() {
    for await (const chunk of result.stream) {
      yield chunk.text();
    }
  }
  return stream();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/ai/service.ts
git commit -m "feat: create AI service layer with Gemini Flash-Lite"
```

---

### Task 3: Create summary generation logic

**Files:**
- Create: `src/server/ai/summaries.ts`

- [ ] **Step 1: Create the summary generation functions**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/server/ai/summaries.ts
git commit -m "feat: add summary generation logic for top-level and free-text questions"
```

---

### Task 4: Create GENERATE_AI_SUMMARY job handler

**Files:**
- Create: `src/server/jobs/handlers/generate-ai-summary.ts`
- Modify: `src/server/jobs/worker.ts` (register handler)

- [ ] **Step 1: Create the job handler**

```typescript
import { db } from "~/server/db";
import { generateTopLevelSummary, generateFreeTextSummary } from "~/server/ai/summaries";

export async function handleGenerateAiSummary(payload: {
  surveyId: string;
  focusPrompt?: string;
  questionId?: string;
}) {
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

    // Top-level summary
    const topContent = await generateTopLevelSummary(context, payload.focusPrompt);
    // For top-level (questionId = null), we need raw SQL due to the partial unique index
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
```

- [ ] **Step 2: Register handler in worker**

In `src/server/jobs/worker.ts`, import and register:
```typescript
import { handleGenerateAiSummary } from "./handlers/generate-ai-summary";
// In the handler map:
GENERATE_AI_SUMMARY: handleGenerateAiSummary,
```

- [ ] **Step 3: Commit**

```bash
git add src/server/jobs/handlers/generate-ai-summary.ts src/server/jobs/worker.ts
git commit -m "feat: add GENERATE_AI_SUMMARY job handler"
```

---

### Task 5: Create AI router and integrate with results page

**Files:**
- Create: `src/server/api/routers/ai.ts`
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Create the AI router**

```typescript
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

export const aiRouter = createTRPCRouter({
  getSummaries: protectedProcedure
    .input(z.object({ surveyId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Premium check
      const subscription = await ctx.db.subscription.findUnique({
        where: { userId: ctx.userId },
      });
      if (!subscription || subscription.plan === "FREE") {
        throw new TRPCError({ code: "FORBIDDEN", message: "AI Insights requires a Premium subscription" });
      }

      return ctx.db.aiSummary.findMany({
        where: { surveyId: input.surveyId },
        orderBy: { generatedAt: "desc" },
      });
    }),

  regenerateSummary: protectedProcedure
    .input(
      z.object({
        surveyId: z.string().uuid(),
        questionId: z.string().uuid().nullable(),
        focusPrompt: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Premium check
      const subscription = await ctx.db.subscription.findUnique({
        where: { userId: ctx.userId },
      });
      if (!subscription || subscription.plan === "FREE") {
        throw new TRPCError({ code: "FORBIDDEN", message: "AI Insights requires a Premium subscription" });
      }

      // Verify creator owns the survey
      const survey = await ctx.db.survey.findUnique({
        where: { id: input.surveyId },
        select: { creatorId: true },
      });
      if (!survey || survey.creatorId !== ctx.userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your survey" });
      }

      // Queue regeneration job
      await ctx.db.backgroundJob.create({
        data: {
          type: "GENERATE_AI_SUMMARY",
          surveyId: input.surveyId,
          payload: {
            surveyId: input.surveyId,
            questionId: input.questionId,
            focusPrompt: input.focusPrompt,
          },
        },
      });

      return { queued: true };
    }),
});
```

- [ ] **Step 2: Register in root.ts**

```typescript
import { aiRouter } from "~/server/api/routers/ai";
// Add: ai: aiRouter
```

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/ai.ts src/server/api/root.ts
git commit -m "feat: add AI router (getSummaries, regenerateSummary)"
```

---

### Task 6: Create AiSummaryCard and PremiumUpsell components

**Files:**
- Create: `src/app/_components/ai-summary-card.tsx`
- Create: `src/app/_components/premium-upsell.tsx`

- [ ] **Step 1: Create AiSummaryCard**

```typescript
"use client";

import { api } from "~/trpc/react";
import { useState } from "react";

interface AiSummaryCardProps {
  surveyId: string;
  questionId: string | null;
  content: string | null; // null = still generating
}

export function AiSummaryCard({ surveyId, questionId, content }: AiSummaryCardProps) {
  const [focusPrompt, setFocusPrompt] = useState("");
  const [showFocusInput, setShowFocusInput] = useState(false);
  const regenerate = api.ai.regenerateSummary.useMutation();

  if (!content) {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <span className="text-sm text-blue-700">Generating AI summary...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-600">AI Summary</span>
        <button
          onClick={() => setShowFocusInput(!showFocusInput)}
          className="text-xs text-blue-600 hover:underline"
        >
          Regenerate
        </button>
      </div>
      <div className="prose prose-sm" dangerouslySetInnerHTML={{ __html: content }} />
      {showFocusInput && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={focusPrompt}
            onChange={(e) => setFocusPrompt(e.target.value)}
            placeholder="Focus on... (optional)"
            className="flex-1 rounded border px-2 py-1 text-sm"
          />
          <button
            onClick={() => {
              regenerate.mutate({ surveyId, questionId, focusPrompt: focusPrompt || undefined });
              setShowFocusInput(false);
              setFocusPrompt("");
            }}
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white"
          >
            Go
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create PremiumUpsell**

```typescript
interface PremiumUpsellProps {
  feature: string;
  message: string;
}

export function PremiumUpsell({ feature, message }: PremiumUpsellProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">🔒</span>
        <div>
          <p className="text-sm font-medium text-gray-700">{feature}</p>
          <p className="text-xs text-gray-500">{message}</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/ai-summary-card.tsx src/app/_components/premium-upsell.tsx
git commit -m "feat: add AiSummaryCard and PremiumUpsell components"
```

---

### Task 7: Hook summary generation into survey.close

**Files:**
- Modify: `src/server/api/routers/survey.ts` (the close procedure)

- [ ] **Step 1: Queue AI summary job on close for premium users**

In the `survey.close` mutation, after setting status to CLOSED and soft-deleting IN_PROGRESS responses, add:

```typescript
// Queue AI summary generation if creator is premium
const subscription = await ctx.db.subscription.findUnique({
  where: { userId: ctx.userId },
});
if (subscription && subscription.plan !== "FREE" && subscription.status === "ACTIVE") {
  await ctx.db.backgroundJob.create({
    data: {
      type: "GENERATE_AI_SUMMARY",
      surveyId: input.surveyId,
      payload: { surveyId: input.surveyId },
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/api/routers/survey.ts
git commit -m "feat: queue AI summary generation on survey close for premium users"
```

---

## Verification Checklist

- [ ] `pnpm typecheck` — no errors
- [ ] GEMINI_API_KEY env var configured
- [ ] AI router: getSummaries (premium-gated), regenerateSummary (queues job)
- [ ] GENERATE_AI_SUMMARY job handler creates top-level + per-free-text summaries
- [ ] AiSummaryCard renders content or "Generating..." spinner
- [ ] PremiumUpsell shows lock icon with custom message
- [ ] survey.close queues AI summary job for premium users
