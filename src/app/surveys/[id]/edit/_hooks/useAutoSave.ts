"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { api } from "~/trpc/react";
import type { useSurveyBuilder } from "./useSurveyBuilder";

type BuilderReturn = ReturnType<typeof useSurveyBuilder>;

export type SaveStatus = "saved" | "saving" | "error";

const DEBOUNCE_MS = 1500;

export function useAutoSave(builder: BuilderReturn) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const surveyUpdateMutation = api.survey.update.useMutation();
  const questionUpsertMutation = api.question.upsert.useMutation();
  const questionDeleteMutation = api.question.delete.useMutation();

  // Track which question IDs existed on last save, to detect deletions
  const prevQuestionIdsRef = useRef<Set<string>>(
    new Set(builder.questions.map((q) => q.id)),
  );

  const performSave = useCallback(async () => {
    const promises: Promise<unknown>[] = [];

    // Save survey metadata if dirty
    if (builder.surveyDirty) {
      promises.push(
        surveyUpdateMutation.mutateAsync({
          id: builder.surveyId,
          title: builder.survey.title,
          description: builder.survey.description,
          slug: builder.survey.slug,
          isPrivate: builder.survey.isPrivate,
          accessMode: builder.survey.accessMode,
          resultsVisibility: builder.survey.resultsVisibility,
          categories: builder.survey.categories,
          tags: builder.survey.tags,
        }),
      );
    }

    // Upsert dirty questions
    for (const questionId of builder.dirtyQuestionIds) {
      const question = builder.questions.find((q) => q.id === questionId);
      if (question) {
        promises.push(
          questionUpsertMutation.mutateAsync({
            questionId: question.id,
            surveyId: builder.surveyId,
            text: question.text,
            questionType: question.questionType,
            position: question.position,
            required: question.required,
            options: question.options,
            minRating: question.minRating,
            maxRating: question.maxRating,
            maxLength: question.maxLength,
          }),
        );
      }
    }

    // Detect deleted questions
    const currentIds = new Set(builder.questions.map((q) => q.id));
    for (const prevId of prevQuestionIdsRef.current) {
      if (!currentIds.has(prevId)) {
        promises.push(questionDeleteMutation.mutateAsync({ questionId: prevId }));
      }
    }

    if (promises.length === 0) return;

    setSaveStatus("saving");
    try {
      await Promise.all(promises);
      builder.setSurveyDirty(false);
      builder.setDirtyQuestionIds(new Set());
      prevQuestionIdsRef.current = currentIds;
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }, [
    builder,
    surveyUpdateMutation,
    questionUpsertMutation,
    questionDeleteMutation,
  ]);

  // Debounced trigger: any time dirty state changes, schedule a save
  useEffect(() => {
    const hasDirtyData =
      builder.surveyDirty || builder.dirtyQuestionIds.size > 0;

    if (!hasDirtyData) return;

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      void performSave();
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [
    builder.surveyDirty,
    builder.dirtyQuestionIds,
    performSave,
  ]);

  return { saveStatus };
}
