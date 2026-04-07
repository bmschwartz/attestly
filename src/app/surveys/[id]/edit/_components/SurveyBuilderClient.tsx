"use client";

import { useState } from "react";
import type { RouterOutputs } from "~/trpc/react";
import { BuilderHeader } from "./BuilderHeader";
import { BuilderFooter } from "./BuilderFooter";
import { SurveyMetadataForm } from "./SurveyMetadataForm";
import { QuestionCardList } from "./QuestionCardList";
import { AddQuestionButton } from "./AddQuestionButton";
import { PreviewPane } from "./PreviewPane";
import { useSurveyBuilder } from "../_hooks/useSurveyBuilder";
import { useAutoSave } from "../_hooks/useAutoSave";

type SurveyForEdit = NonNullable<RouterOutputs["survey"]["getForEdit"]>;

interface SurveyBuilderClientProps {
  initialSurvey: SurveyForEdit;
}

export function SurveyBuilderClient({
  initialSurvey,
}: SurveyBuilderClientProps) {
  const [activeTab, setActiveTab] = useState<"editor" | "preview">("editor");

  const builder = useSurveyBuilder(initialSurvey);
  const { saveStatus } = useAutoSave(builder);

  return (
    <div className="flex h-screen flex-col">
      <BuilderHeader
        saveStatus={saveStatus}
        surveyId={initialSurvey.id}
        survey={builder.survey}
        questions={builder.questions}
        validationErrors={builder.validationErrors}
        onPublish={builder.handlePublish}
      />

      {/* Mobile tab toggle */}
      <div className="flex border-b border-gray-200 md:hidden">
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === "editor"
              ? "border-b-2 border-blue-500 text-blue-600"
              : "text-gray-500"
          }`}
          onClick={() => setActiveTab("editor")}
        >
          Editor
        </button>
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === "preview"
              ? "border-b-2 border-blue-500 text-blue-600"
              : "text-gray-500"
          }`}
          onClick={() => setActiveTab("preview")}
        >
          Preview
        </button>
      </div>

      {/* Split pane layout */}
      <div className="flex min-h-0 flex-1">
        {/* Editor pane — hidden on mobile when preview tab active */}
        <div
          className={`flex-1 overflow-y-auto border-r border-gray-200 p-6 ${
            activeTab === "preview" ? "hidden md:block" : ""
          }`}
        >
          <SurveyMetadataForm
            survey={builder.survey}
            validationErrors={builder.validationErrors}
            onUpdateField={builder.updateSurveyField}
            onUpdateCategories={builder.updateCategories}
            onUpdateTags={builder.updateTags}
            isPremium={builder.isPremium}
          />

          <div className="mt-8">
            <QuestionCardList
              questions={builder.questions}
              validationErrors={builder.validationErrors}
              onUpdateQuestion={builder.updateQuestion}
              onMoveQuestion={builder.moveQuestion}
              onDuplicateQuestion={builder.duplicateQuestion}
              onDeleteQuestion={builder.deleteQuestion}
            />
          </div>

          <div className="mt-4">
            <AddQuestionButton onAddQuestion={builder.addQuestion} />
          </div>
        </div>

        {/* Preview pane — hidden on mobile when editor tab active */}
        <div
          className={`flex-1 overflow-y-auto bg-gray-50 p-6 ${
            activeTab === "editor" ? "hidden md:block" : ""
          }`}
        >
          <PreviewPane
            survey={builder.survey}
            questions={builder.questions}
          />
        </div>
      </div>

      <BuilderFooter
        questionCount={builder.questions.length}
        status="DRAFT"
      />
    </div>
  );
}
