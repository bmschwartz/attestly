/**
 * tRPC server initialization with Privy-based authentication.
 */
import "server-only";

import { initTRPC, TRPCError } from "@trpc/server";
import { PrivyClient } from "@privy-io/server-auth";
import superjson from "superjson";
import { ZodError } from "zod";

import { env } from "~/env";
import { db } from "~/server/db";

/**
 * Privy server client — created once at module load.
 */
const privy = new PrivyClient(
  env.NEXT_PUBLIC_PRIVY_APP_ID,
  env.PRIVY_APP_SECRET,
);

/**
 * 1. CONTEXT
 *
 * The tRPC context is created for every request. `userId` and `walletAddress`
 * are populated by the auth middleware for protected procedures.
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  return {
    db,
    userId: null as string | null,
    walletAddress: null as string | null,
    ...opts,
  };
};

/**
 * 2. INITIALIZATION
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE
 */
export const createTRPCRouter = t.router;

/**
 * Timing middleware — adds artificial dev delay and logs execution time.
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();

  if (t._config.isDev) {
    const waitMs = Math.floor(Math.random() * 400) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const result = await next();

  const end = Date.now();
  console.log(`[TRPC] ${path} took ${end - start}ms to execute`);

  return result;
});

/**
 * Auth middleware — verifies the Privy Bearer token from request headers,
 * fetches/upserts the User record (creating a FREE Subscription on first login),
 * and injects `ctx.userId` and `ctx.walletAddress`.
 */
const authMiddleware = t.middleware(async ({ ctx, next }) => {
  const authHeader = ctx.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Missing auth token" });
  }

  const token = authHeader.slice(7);

  let privyUserId: string;
  try {
    const claims = await privy.verifyAuthToken(token);
    privyUserId = claims.userId;
  } catch {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid auth token" });
  }

  // Check if user already exists in local DB — skip Privy API call if so.
  const existingUser = await ctx.db.user.findUnique({
    where: { privyId: privyUserId },
    select: { id: true, walletAddress: true },
  });

  if (existingUser && existingUser.walletAddress !== "pending") {
    // User exists with real wallet — skip Privy API call.
    return next({
      ctx: {
        ...ctx,
        userId: existingUser.id,
        walletAddress: existingUser.walletAddress,
      },
    });
  }

  // First login or wallet not yet linked — fetch from Privy.
  let privyUser;
  try {
    privyUser = await privy.getUser(privyUserId);
  } catch {
    // If Privy API fails but user exists locally, use local data.
    if (existingUser) {
      return next({
        ctx: {
          ...ctx,
          userId: existingUser.id,
          walletAddress: existingUser.walletAddress,
        },
      });
    }
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Could not verify user" });
  }

  const walletAddress = privyUser.wallet?.address ?? null;
  const email = privyUser.email?.address ?? null;

  // Upsert User — create with FREE Subscription on first login.
  // Wrap in try/catch to handle race condition when multiple requests
  // arrive simultaneously for a new user (concurrent upsert creates).
  let user;
  try {
    user = await ctx.db.user.upsert({
      where: { privyId: privyUserId },
      update: {
        ...(walletAddress ? { walletAddress } : {}),
        ...(email ? { email } : {}),
      },
      create: {
        privyId: privyUserId,
        walletAddress: walletAddress ?? "pending",
        email,
        subscription: {
          create: {
            plan: "FREE",
            status: "ACTIVE",
          },
        },
      },
    });
  } catch (e: unknown) {
    // Unique constraint violation — another request already created the user
    const prismaError = e as { code?: string };
    if (prismaError.code === "P2002") {
      user = await ctx.db.user.findUniqueOrThrow({
        where: { privyId: privyUserId },
      });
    } else {
      throw e;
    }
  }

  return next({
    ctx: {
      ...ctx,
      userId: user.id,
      walletAddress: user.walletAddress,
    },
  });
});

/**
 * Public (unauthenticated) procedure.
 */
export const publicProcedure = t.procedure.use(timingMiddleware);

/**
 * Protected (authenticated) procedure.
 *
 * Guarantees `ctx.userId` and `ctx.walletAddress` are non-null strings.
 */
export const protectedProcedure = t.procedure
  .use(timingMiddleware)
  .use(authMiddleware)
  .use(({ ctx, next }) => {
    // After authMiddleware, userId is guaranteed non-null.
    if (!ctx.userId) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    return next({
      ctx: {
        ...ctx,
        userId: ctx.userId,
        walletAddress: ctx.walletAddress,
      },
    });
  });
