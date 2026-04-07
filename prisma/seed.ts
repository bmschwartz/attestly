import { PrismaClient, QuestionType, SurveyStatus } from "../generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Create a test user
  const user = await prisma.user.upsert({
    where: { privyId: "test-privy-id" },
    update: {},
    create: {
      privyId: "test-privy-id",
      walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
      email: "test@attest.ly",
      displayName: "Test User",
      isAdmin: true,
      subscription: {
        create: {
          plan: "PREMIUM",
          status: "ACTIVE",
        },
      },
    },
  });

  // Create a second user (respondent)
  const respondent = await prisma.user.upsert({
    where: { privyId: "test-respondent-id" },
    update: {},
    create: {
      privyId: "test-respondent-id",
      walletAddress: "0xabcdef1234567890abcdef1234567890abcdef12",
      email: "respondent@example.com",
      displayName: "Test Respondent",
      subscription: {
        create: {
          plan: "FREE",
          status: "ACTIVE",
        },
      },
    },
  });

  // Create a draft survey
  const draftSurvey = await prisma.survey.upsert({
    where: { slug: "draft-survey-x1a2" },
    update: {},
    create: {
      creatorId: user.id,
      title: "Draft Survey",
      description: "A survey still being built",
      slug: "draft-survey-x1a2",
      status: SurveyStatus.DRAFT,
      categories: ["Research"],
      tags: ["test"],
    },
  });

  // Create a published survey with questions
  const publishedSurvey = await prisma.survey.upsert({
    where: { slug: "employee-satisfaction-k3m7" },
    update: {},
    create: {
      creatorId: user.id,
      title: "Employee Satisfaction Survey 2026",
      description: "We'd love to hear your honest feedback about your experience.",
      slug: "employee-satisfaction-k3m7",
      status: SurveyStatus.PUBLISHED,
      publishedAt: new Date(),
      categories: ["Business", "Research"],
      tags: ["workplace", "feedback"],
    },
  });

  // Add questions to the published survey
  const questions = [
    {
      surveyId: publishedSurvey.id,
      text: "How satisfied are you with your role?",
      questionType: QuestionType.SINGLE_SELECT,
      position: 0,
      required: true,
      options: ["Very Satisfied", "Satisfied", "Neutral", "Dissatisfied", "Very Dissatisfied"],
    },
    {
      surveyId: publishedSurvey.id,
      text: "Rate your work-life balance",
      questionType: QuestionType.RATING,
      position: 1,
      required: true,
      options: [],
      minRating: 1,
      maxRating: 5,
    },
    {
      surveyId: publishedSurvey.id,
      text: "Select all benefits that matter to you",
      questionType: QuestionType.MULTIPLE_CHOICE,
      position: 2,
      required: false,
      options: ["Health Insurance", "Remote Work", "Professional Development", "Stock Options"],
    },
    {
      surveyId: publishedSurvey.id,
      text: "Any additional comments?",
      questionType: QuestionType.FREE_TEXT,
      position: 3,
      required: false,
      options: [],
      maxLength: 500,
    },
  ];

  for (const q of questions) {
    await prisma.question.upsert({
      where: {
        surveyId_position: {
          surveyId: q.surveyId,
          position: q.position,
        },
      },
      update: {},
      create: q,
    });
  }

  console.log("Seed data created:");
  console.log(`  Users: ${user.displayName}, ${respondent.displayName}`);
  console.log(`  Surveys: ${draftSurvey.title}, ${publishedSurvey.title}`);
  console.log(`  Questions: ${questions.length} on published survey`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
