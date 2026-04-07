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

  // Track dirty state for auto-save
  const [surveyDirty, setSurveyDirty] = useState(false);
  const [dirtyQuestionIds, setDirtyQuestionIds] = useState<Set<string>>(
    new Set(),
  );

  const updateSurveyField = useCallback(
    (field: keyof SurveyState, value: SurveyState[keyof SurveyState]) => {
      setSurvey((prev) => ({ ...prev, [field]: value }));
      setSurveyDirty(true);
    },
    [],
  );

  const updateCategories = useCallback((categories: string[]) => {
    setSurvey((prev) => ({ ...prev, categories }));
    setSurveyDirty(true);
  }, []);

  const updateTags = useCallback((tags: string[]) => {
    setSurvey((prev) => ({ ...prev, tags }));
    setSurveyDirty(true);
  }, []);

  const updateQuestion = useCallback(
    (questionId: string, updates: Partial<QuestionDraft>) => {
      setQuestions((prev) =>
        prev.map((q) => (q.id === questionId ? { ...q, ...updates } : q)),
      );
      setDirtyQuestionIds((prev) => new Set(prev).add(questionId));
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
      setDirtyQuestionIds((prev) => new Set(prev).add(newQuestion.id));
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

        // Mark both as dirty
        setDirtyQuestionIds((prevDirty) => {
          const next = new Set(prevDirty);
          next.add(current.id);
          next.add(swap.id);
          return next;
        });

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

      setDirtyQuestionIds((prevDirty) => new Set(prevDirty).add(duplicate.id));
      return [...prev, duplicate];
    });
  }, []);

  const deleteQuestion = useCallback((questionId: string) => {
    setQuestions((prev) => {
      const filtered = prev.filter((q) => q.id !== questionId);
      // Reindex positions
      return filtered.map((q, i) => ({ ...q, position: i }));
    });
    // Note: deletion is handled separately via question.delete mutation in auto-save
    setDirtyQuestionIds((prev) => {
      const next = new Set(prev);
      next.delete(questionId);
      return next;
    });
  }, []);

  const publishMutation = api.survey.publish.useMutation({
    onSuccess: () => {
      router.push(`/s/${survey.slug}`);
    },
  });

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
    surveyDirty,
    dirtyQuestionIds,
    setSurveyDirty,
    setDirtyQuestionIds,
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
