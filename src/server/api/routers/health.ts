import { createTRPCRouter, publicProcedure, protectedProcedure } from "~/server/api/trpc";

export const healthRouter = createTRPCRouter({
  /**
   * Public health check — returns "pong" with a timestamp.
   */
  ping: publicProcedure.query(() => {
    return { status: "ok", timestamp: new Date().toISOString() };
  }),

  /**
   * Protected whoami — returns the authenticated user's ID and wallet address.
   */
  whoami: protectedProcedure.query(({ ctx }) => {
    return {
      userId: ctx.userId,
      walletAddress: ctx.walletAddress,
    };
  }),
});
