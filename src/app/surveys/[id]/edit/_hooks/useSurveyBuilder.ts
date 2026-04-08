"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { RouterOutputs } from "~/trpc/react";
import { api } from "~/trpc/react";
import type { QuestionDraft, ValidationError } from "../_lib/validation";
import { validateSurveyForPublish } from "../_lib/validation";
import { LIMITS } from "../_lib/constants";
import { usePremium } from "~/hooks/use-premium";

type SurveyForEdit = NonNullable<RouterOutputs["survey"]["getForEdit"]>;

export interface SurveyState {
  title: string;
  description: string;
  slug: string;
  isPrivate: boolean;
  accessMode: "OPEN" | "INVITE_ONLY";
  resultsVisibility: "PUBLIC" | "RESPONDENTS" | "CREATOR";
  categories: string[];
  tags: string[];
}

export interface StepValidation {
  basics: ValidationError[];
  questions: ValidationError[];
  settings: ValidationError[];
}

/** Fields that belong to each step's validation bucket. */
const BASICS_FIELDS = new Set(["title", "description"]);
const QUESTIONS_FIELDS = new Set(["questions", "questionText", "options", "rating", "maxLength"]);
const SETTINGS_FIELDS = new Set(["categories", "tags"]);

export function useSurveyBuilder(initialSurvey: SurveyForEdit) {
  const router = useRouter();

  const [survey, setSurvey] = useState<SurveyState>({
    title: initialSurvey.title,
    description: initialSurvey.description,
    slug: initialSurvey.slug,
    isPrivate: initialSurvey.isPrivate,
    accessMode: initialSurvey.accessMode,
    resultsVisibility: initialSurvey.resultsVisibility,
    categories: (initialSurvey.categories as string[]) ?? [],
    tags: (initialSurvey.tags as string[]) ?? [],
  });

  const [questions, setQuestions] = useState<QuestionDraft[]>(
    initialSurvey.questions
      .sort((a, b) => a.position - b.position)
      .map((q) => ({
        id: q.id,
        text: q.text,
        questionType: q.questionType,
        position: q.position,
        required: q.required,
        options: (q.options as string[]) ?? [],
        minRating: q.minRating,
        maxRating: q.maxRating,
        maxLength: q.maxLength,
      })),
  );

  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    [],
  );

  const { isPremium } = usePremium();

  // -------------------------------------------------------------------------
  // tRPC mutations
  // -------------------------------------------------------------------------

  const updateSurveyMutation = api.survey.update.useMutation();
  const upsertQuestionMutation = api.question.upsert.useMutation();

  const publishMutation = api.survey.publish.useMutation({
    onSuccess: () => {
      router.push(`/s/${survey.slug}`);
    },
  });

  // -------------------------------------------------------------------------
  // Field update helpers
  // -------------------------------------------------------------------------

  const updateSurveyField = useCallback(
    (field: keyof SurveyState, value: SurveyState[keyof SurveyState]) => {
      setSurvey((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const updateCategories = useCallback((categories: string[]) => {
    setSurvey((prev) => ({ ...prev, categories }));
  }, []);

  const updateTags = useCallback((tags: string[]) => {
    setSurvey((prev) => ({ ...prev, tags }));
  }, []);

  // -------------------------------------------------------------------------
  // Question CRUD
  // -------------------------------------------------------------------------

  const updateQuestion = useCallback(
    (questionId: string, updates: Partial<QuestionDraft>) => {
      setQuestions((prev) =>
        prev.map((q) => (q.id === questionId ? { ...q, ...updates } : q)),
      );
    },
    [],
  );

  const addQuestion = useCallback(
    (
      questionType: QuestionDraft["questionType"],
    ) => {
      const newQuestion: QuestionDraft = {
        id: crypto.randomUUID(),
        text: "",
        questionType,
        position: questions.length,
        required: false,
        options:
          questionType === "SINGLE_SELECT" || questionType === "MULTIPLE_CHOICE"
            ? ["", ""]
            : [],
        minRating: questionType === "RATING" ? LIMITS.RATING_DEFAULT_MIN : null,
        maxRating: questionType === "RATING" ? LIMITS.RATING_DEFAULT_MAX : null,
        maxLength:
          questionType === "FREE_TEXT"
            ? LIMITS.FREE_TEXT_DEFAULT_MAX_LENGTH
            : null,
      };
      setQuestions((prev) => [...prev, newQuestion]);
    },
    [questions.length],
  );

  const moveQuestion = useCallback(
    (questionId: string, direction: "up" | "down") => {
      setQuestions((prev) => {
        const index = prev.findIndex((q) => q.id === questionId);
        if (index === -1) return prev;
        if (direction === "up" && index === 0) return prev;
        if (direction === "down" && index === prev.length - 1) return prev;

        const newQuestions = [...prev];
        const swapIndex = direction === "up" ? index - 1 : index + 1;
        const current = newQuestions[index]!;
        const swap = newQuestions[swapIndex]!;

        newQuestions[index] = { ...swap, position: index };
        newQuestions[swapIndex] = { ...current, position: swapIndex };

        return newQuestions;
      });
    },
    [],
  );

  const duplicateQuestion = useCallback((questionId: string) => {
    setQuestions((prev) => {
      const source = prev.find((q) => q.id === questionId);
      if (!source) return prev;

      const duplicate: QuestionDraft = {
        ...source,
        id: crypto.randomUUID(),
        position: prev.length,
      };

      return [...prev, duplicate];
    });
  }, []);

  const deleteQuestion = useCallback((questionId: string) => {
    setQuestions((prev) => {
      const filtered = prev.filter((q) => q.id !== questionId);
      // Reindex positions
      return filtered.map((q, i) => ({ ...q, position: i }));
    });
  }, []);

  // -------------------------------------------------------------------------
  // Save-on-navigate: persist current state to DB
  // -------------------------------------------------------------------------

  /**
   * Saves all current survey metadata + all questions to the DB.
   * Called by WizardShell's onStepChange before navigating.
   */
  const saveCurrentState = useCallback(async (): Promise<void> => {
    // Read latest state via a ref-like snapshot captured in the closure.
    // We use a Promise.all to fire survey update + all question upserts.
    await updateSurveyMutation.mutateAsync({
      id: initialSurvey.id,
      title: survey.title,
      description: survey.description,
      isPrivate: survey.isPrivate,
      accessMode: survey.accessMode,
      resultsVisibility: survey.resultsVisibility,
      categories: survey.categories,
      tags: survey.tags,
    });

    // Upsert every question in parallel (only those with text — skip empty drafts)
    const upsertPromises = questions.map((q) =>
      upsertQuestionMutation.mutateAsync({
        surveyId: initialSurvey.id,
        questionId: q.id,
        text: q.text || " ", // API requires min 1 char; empty questions will fail validation anyway
        questionType: q.questionType,
        position: q.position,
        required: q.required,
        options: q.options,
        minRating: q.minRating,
        maxRating: q.maxRating,
        maxLength: q.maxLength,
      }),
    );

    await Promise.all(upsertPromises);
  }, [
    initialSurvey.id,
    survey,
    questions,
    updateSurveyMutation,
    upsertQuestionMutation,
  ]);

  // -------------------------------------------------------------------------
  // Step validation
  // -------------------------------------------------------------------------

  /**
   * Returns validation errors categorized by wizard step.
   */
  const getStepValidation = useCallback((): StepValidation => {
    const allErrors = validateSurveyForPublish({
      title: survey.title,
      description: survey.description,
      slug: survey.slug,
      categories: survey.categories,
      tags: survey.tags,
      questions,
    });

    const basics: ValidationError[] = [];
    const questionErrors: ValidationError[] = [];
    const settings: ValidationError[] = [];

    for (const error of allErrors) {
      if (BASICS_FIELDS.has(error.field)) {
        basics.push(error);
      } else if (QUESTIONS_FIELDS.has(error.field)) {
        questionErrors.push(error);
      } else if (SETTINGS_FIELDS.has(error.field)) {
        settings.push(error);
      } else {
        // Fallback: put unknown fields in basics
        basics.push(error);
      }
    }

    return { basics, questions: questionErrors, settings };
  }, [survey, questions]);

  // -------------------------------------------------------------------------
  // Publish flow
  // -------------------------------------------------------------------------

  const handlePublish = useCallback(() => {
    // Run validation
    const errors = validateSurveyForPublish({
      title: survey.title,
      description: survey.description,
      slug: survey.slug,
      categories: survey.categories,
      tags: survey.tags,
      questions,
    });

    setValidationErrors(errors);

    if (errors.length > 0) {
      return false;
    }

    return true; // Validation passed — caller shows confirmation dialog
  }, [survey, questions]);

  const confirmPublish = useCallback(() => {
    publishMutation.mutate({ id: initialSurvey.id });
  }, [publishMutation, initialSurvey.id]);

  return {
    surveyId: initialSurvey.id,
    survey,
    questions,
    validationErrors,
    isPremium,
    saveCurrentState,
    getStepValidation,
    updateSurveyField,
    updateCategories,
    updateTags,
    updateQuestion,
    addQuestion,
    moveQuestion,
    duplicateQuestion,
    deleteQuestion,
    handlePublish,
    confirmPublish,
    isPublishing: publishMutation.isPending,
  };
}
