import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { aiRouter } from "~/server/api/routers/ai";
import { exploreRouter } from "~/server/api/routers/explore";
import { healthRouter } from "~/server/api/routers/health";
import { inviteRouter } from "~/server/api/routers/invite";
import { questionRouter } from "~/server/api/routers/question";
import { responseRouter } from "~/server/api/routers/response";
import { resultsRouter } from "~/server/api/routers/results";
import { surveyRouter } from "~/server/api/routers/survey";
import { userRouter } from "~/server/api/routers/user";
import { profileRouter } from "~/server/api/routers/profile";
import { adminRouter } from "~/server/api/routers/admin";
import { verificationRouter } from "~/server/api/routers/verification";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  ai: aiRouter,
  explore: exploreRouter,
  health: healthRouter,
  invite: inviteRouter,
  question: questionRouter,
  response: responseRouter,
  results: resultsRouter,
  survey: surveyRouter,
  user: userRouter,
  profile: profileRouter,
  admin: adminRouter,
  verification: verificationRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
