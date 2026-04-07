import { LIMITS } from "./constants";

export interface QuestionDraft {
  id: string;
  text: string;
  questionType: "SINGLE_SELECT" | "MULTIPLE_CHOICE" | "RATING" | "FREE_TEXT";
  position: number;
  required: boolean;
  options: string[];
  minRating: number | null;
  maxRating: number | null;
  maxLength: number | null;
}

export interface SurveyDraft {
  title: string;
  description: string;
  slug: string;
  categories: string[];
  tags: string[];
  questions: QuestionDraft[];
}

export interface ValidationError {
  field: string;
  questionIndex?: number;
  message: string;
}

export function validateSurveyForPublish(
  survey: SurveyDraft,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Title validation
  if (!survey.title.trim()) {
    errors.push({ field: "title", message: "Survey title is required" });
  } else if (survey.title.length > LIMITS.TITLE_MAX) {
    errors.push({
      field: "title",
      message: `Title must be under ${LIMITS.TITLE_MAX} characters`,
    });
  }

  // Description validation
  if (!survey.description.trim()) {
    errors.push({
      field: "description",
      message: "Survey description is required",
    });
  } else if (survey.description.length > LIMITS.DESCRIPTION_MAX) {
    errors.push({
      field: "description",
      message: `Description must be under ${LIMITS.DESCRIPTION_MAX} characters`,
    });
  }

  // Categories validation
  if (survey.categories.length < LIMITS.CATEGORIES_MIN) {
    errors.push({
      field: "categories",
      message: "Select at least 1 category",
    });
  } else if (survey.categories.length > LIMITS.CATEGORIES_MAX) {
    errors.push({ field: "categories", message: "Maximum 5 categories" });
  }

  // Tags validation
  if (survey.tags.length > LIMITS.TAGS_MAX) {
    errors.push({ field: "tags", message: "Maximum 10 tags" });
  }

  // Question count validation
  if (survey.questions.length < LIMITS.QUESTIONS_MIN) {
    errors.push({
      field: "questions",
      message: "Survey must have at least 1 question",
    });
  } else if (survey.questions.length > LIMITS.QUESTIONS_MAX) {
    errors.push({
      field: "questions",
      message: "Survey cannot have more than 100 questions",
    });
  }

  // Per-question validation
  survey.questions.forEach((question, index) => {
    const n = index + 1;

    if (!question.text.trim()) {
      errors.push({
        field: "questionText",
        questionIndex: index,
        message: `Question ${n} is missing text`,
      });
    }

    if (
      question.questionType === "SINGLE_SELECT" ||
      question.questionType === "MULTIPLE_CHOICE"
    ) {
      if (question.options.length < LIMITS.OPTIONS_MIN) {
        errors.push({
          field: "options",
          questionIndex: index,
          message: `Question ${n} must have at least 2 options`,
        });
      }

      const hasEmpty = question.options.some((opt) => !opt.trim());
      if (hasEmpty) {
        errors.push({
          field: "options",
          questionIndex: index,
          message: `Question ${n} has an empty option`,
        });
      }

      const uniqueOptions = new Set(
        question.options.map((opt) => opt.trim().toLowerCase()),
      );
      if (uniqueOptions.size !== question.options.length) {
        errors.push({
          field: "options",
          questionIndex: index,
          message: `Question ${n} has duplicate options`,
        });
      }
    }

    if (question.questionType === "RATING") {
      const min = question.minRating ?? LIMITS.RATING_DEFAULT_MIN;
      const max = question.maxRating ?? LIMITS.RATING_DEFAULT_MAX;
      if (min >= max) {
        errors.push({
          field: "rating",
          questionIndex: index,
          message: `Question ${n}: min rating must be less than max`,
        });
      }
    }

    if (question.questionType === "FREE_TEXT") {
      const maxLength =
        question.maxLength ?? LIMITS.FREE_TEXT_DEFAULT_MAX_LENGTH;
      if (maxLength <= 0) {
        errors.push({
          field: "maxLength",
          questionIndex: index,
          message: `Question ${n}: max length must be greater than 0`,
        });
      }
    }
  });

  return errors;
}

export function getErrorsForField(
  errors: ValidationError[],
  field: string,
  questionIndex?: number,
): string[] {
  return errors
    .filter(
      (e) =>
        e.field === field &&
        (questionIndex === undefined || e.questionIndex === questionIndex),
    )
    .map((e) => e.message);
}
