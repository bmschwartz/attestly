# Sub-Plan 1b: Auth Migration (NextAuth to Privy) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove NextAuth entirely, install Privy, wire up PrivyProvider on the client and Privy token verification in the tRPC auth middleware, with user upsert and subscription creation on first login.

**Architecture:** Privy handles all authentication client-side (Google, Apple, Email magic link) and issues JWTs. The tRPC `protectedProcedure` middleware verifies the Privy token server-side via `@privy-io/server-auth`, upserts a User record (with Subscription on first login), and attaches `userId` and `walletAddress` to the tRPC context. No NextAuth session, no server-side session store.

**Tech Stack:** Privy React Auth, Privy Server Auth, tRPC, Prisma, Next.js 16, Tailwind CSS 4

**Spec reference:** `docs/superpowers/specs/2026-04-04-auth-design.md`

---

## File Structure

- Delete: `src/server/auth/config.ts`
- Delete: `src/server/auth/index.ts`
- Delete: `src/app/api/auth/[...nextauth]/route.ts`
- Modify: `package.json` — remove NextAuth deps, add Privy deps
- Modify: `src/env.js` — remove AUTH_SECRET, add Privy env vars
- Create: `src/app/_components/providers/privy-provider.tsx`
- Modify: `src/app/layout.tsx` — wrap with PrivyProvider
- Modify: `src/server/api/trpc.ts` — rewrite auth middleware for Privy
- Modify: `src/trpc/react.tsx` — send Privy auth token in headers
- Modify: `src/app/page.tsx` — remove NextAuth session usage
- Create: `src/server/api/routers/health.ts` — test router for verifying auth
- Modify: `src/server/api/root.ts` — register health router

---

### Task 1: Remove NextAuth packages and files

**Files:**
- Delete: `src/server/auth/config.ts`
- Delete: `src/server/auth/index.ts`
- Delete: `src/app/api/auth/[...nextauth]/route.ts`
- Modify: `package.json`

- [ ] **Step 1: Uninstall NextAuth packages**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm remove next-auth @auth/prisma-adapter
```

- [ ] **Step 2: Delete the NextAuth server auth directory**

```bash
rm -rf /Users/bmschwartz/Development/attestly/src/server/auth
```

- [ ] **Step 3: Delete the NextAuth API route**

```bash
rm -rf /Users/bmschwartz/Development/attestly/src/app/api/auth
```

- [ ] **Step 4: Clean up the home page — remove NextAuth session usage**

Replace the contents of `src/app/page.tsx` with:

```tsx
import { HydrateClient } from "~/trpc/server";

export default function Home() {
  return (
    <HydrateClient>
      <main>
        <div></div>
      </main>
    </HydrateClient>
  );
}
```

- [ ] **Step 5: Verify no remaining NextAuth imports**

```bash
cd /Users/bmschwartz/Development/attestly && grep -r "next-auth\|NextAuth\|@auth/prisma-adapter\|~/server/auth" src/ --include="*.ts" --include="*.tsx" || echo "No NextAuth references found"
```

Expected: "No NextAuth references found"

- [ ] **Step 6: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add -A
git commit -m "feat: remove NextAuth packages and files"
```

---

### Task 2: Install Privy packages

**Files:**
- Modify: `package.json` (via pnpm)

- [ ] **Step 1: Install Privy client and server packages**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm add @privy-io/react-auth @privy-io/server-auth
```

- [ ] **Step 2: Verify packages installed**

```bash
cd /Users/bmschwartz/Development/attestly && cat package.json | grep privy
```

Expected: both `@privy-io/react-auth` and `@privy-io/server-auth` listed in dependencies.

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add package.json pnpm-lock.yaml
git commit -m "feat: install Privy auth packages"
```

---

### Task 3: Add Privy env vars and remove NextAuth env vars

**Files:**
- Modify: `src/env.js`

- [ ] **Step 1: Update env validation schema**

Replace the entire contents of `src/env.js` with:

```js
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    PRIVY_APP_SECRET: z.string().min(1),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_PRIVY_APP_ID: z.string().min(1),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET,
    NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
    NODE_ENV: process.env.NODE_ENV,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
```

- [ ] **Step 2: Add Privy env vars to `.env` file**

Add the following to the `.env` file (create if it doesn't exist). Use placeholder values — real values must be obtained from the Privy dashboard:

```bash
cd /Users/bmschwartz/Development/attestly
# Only add if not already present — do not overwrite existing values
grep -q "NEXT_PUBLIC_PRIVY_APP_ID" .env 2>/dev/null || echo 'NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id' >> .env
grep -q "PRIVY_APP_SECRET" .env 2>/dev/null || echo 'PRIVY_APP_SECRET=your-privy-app-secret' >> .env
```

Also remove old NextAuth env vars if present:

```bash
cd /Users/bmschwartz/Development/attestly
sed -i '' '/^AUTH_SECRET=/d' .env 2>/dev/null || true
sed -i '' '/^AUTH_DISCORD_ID=/d' .env 2>/dev/null || true
sed -i '' '/^AUTH_DISCORD_SECRET=/d' .env 2>/dev/null || true
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/env.js
git commit -m "feat: add Privy env vars, remove NextAuth env vars"
```

Note: Do NOT commit the `.env` file. It should be in `.gitignore`.

---

### Task 4: Create PrivyProvider wrapper component

**Files:**
- Create: `src/app/_components/providers/privy-provider.tsx`

- [ ] **Step 1: Create the providers directory**

```bash
mkdir -p /Users/bmschwartz/Development/attestly/src/app/_components/providers
```

- [ ] **Step 2: Create the PrivyProvider component**

Create `src/app/_components/providers/privy-provider.tsx`:

```tsx
"use client";

import { PrivyProvider as BasePrivyProvider } from "@privy-io/react-auth";
import { env } from "~/env";

export function PrivyProvider({ children }: { children: React.ReactNode }) {
  return (
    <BasePrivyProvider
      appId={env.NEXT_PUBLIC_PRIVY_APP_ID}
      config={{
        loginMethods: ["google", "apple", "email"],
        appearance: {
          theme: "light",
          accentColor: "#6366f1",
          logo: "/favicon.ico",
        },
        embeddedWallets: {
          createOnLogin: "all-users",
        },
      }}
    >
      {children}
    </BasePrivyProvider>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/app/_components/providers/privy-provider.tsx
git commit -m "feat: create PrivyProvider wrapper component"
```

---

### Task 5: Update root layout to use PrivyProvider

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Wrap the app with PrivyProvider**

Replace the entire contents of `src/app/layout.tsx` with:

```tsx
import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

import { TRPCReactProvider } from "~/trpc/react";
import { PrivyProvider } from "~/app/_components/providers/privy-provider";

export const metadata: Metadata = {
  title: "Attestly",
  description: "",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body>
        <PrivyProvider>
          <TRPCReactProvider>{children}</TRPCReactProvider>
        </PrivyProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/app/layout.tsx
git commit -m "feat: wrap root layout with PrivyProvider"
```

---

### Task 6: Update tRPC client to send Privy auth token

**Files:**
- Modify: `src/trpc/react.tsx`

- [ ] **Step 1: Add Privy token to tRPC request headers**

Replace the entire contents of `src/trpc/react.tsx` with:

```tsx
"use client";

import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { httpBatchStreamLink, loggerLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";
import { useState } from "react";
import SuperJSON from "superjson";

import { type AppRouter } from "~/server/api/root";
import { createQueryClient } from "./query-client";

let clientQueryClientSingleton: QueryClient | undefined = undefined;
const getQueryClient = () => {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return createQueryClient();
  }
  // Browser: use singleton pattern to keep the same query client
  clientQueryClientSingleton ??= createQueryClient();

  return clientQueryClientSingleton;
};

export const api = createTRPCReact<AppRouter>();

/**
 * Inference helper for inputs.
 *
 * @example type HelloInput = RouterInputs['example']['hello']
 */
export type RouterInputs = inferRouterInputs<AppRouter>;

/**
 * Inference helper for outputs.
 *
 * @example type HelloOutput = RouterOutputs['example']['hello']
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export function TRPCReactProvider(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === "development" ||
            (op.direction === "down" && op.result instanceof Error),
        }),
        httpBatchStreamLink({
          transformer: SuperJSON,
          url: getBaseUrl() + "/api/trpc",
          async headers() {
            const headers = new Headers();
            headers.set("x-trpc-source", "nextjs-react");

            // Attach Privy auth token if available
            try {
              const token = await getPrivyToken();
              if (token) {
                headers.set("authorization", `Bearer ${token}`);
              }
            } catch {
              // No token available — request proceeds as unauthenticated
            }

            return headers;
          },
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <api.Provider client={trpcClient} queryClient={queryClient}>
        {props.children}
      </api.Provider>
    </QueryClientProvider>
  );
}

/**
 * Retrieve the Privy auth token from the cookie or client-side storage.
 * Privy stores the token in a cookie named `privy-token` that is accessible client-side.
 */
async function getPrivyToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  // Privy stores the auth token in a cookie named "privy-token"
  const match = document.cookie.match(/(?:^|;\s*)privy-token=([^;]*)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/trpc/react.tsx
git commit -m "feat: send Privy auth token in tRPC request headers"
```

---

### Task 7: Rewrite tRPC auth middleware for Privy

**Files:**
- Modify: `src/server/api/trpc.ts`

- [ ] **Step 1: Replace the tRPC context and auth middleware**

Replace the entire contents of `src/server/api/trpc.ts` with:

```ts
/**
 * tRPC server setup with Privy authentication.
 *
 * - publicProcedure: no auth required
 * - protectedProcedure: verifies Privy token, upserts User (with Subscription on first login),
 *   attaches userId and walletAddress to context
 */

import { initTRPC, TRPCError } from "@trpc/server";
import { PrivyClient } from "@privy-io/server-auth";
import superjson from "superjson";
import { ZodError } from "zod";

import { db } from "~/server/db";
import { env } from "~/env";

/**
 * Privy server client — used to verify auth tokens.
 */
const privy = new PrivyClient(
  env.NEXT_PUBLIC_PRIVY_APP_ID,
  env.PRIVY_APP_SECRET,
);

/**
 * 1. CONTEXT
 *
 * The base context available to all procedures. Auth-specific context (userId, walletAddress)
 * is added by the auth middleware on protectedProcedure.
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  return {
    db,
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
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE
 */
export const createTRPCRouter = t.router;

/**
 * Middleware for timing procedure execution and adding an artificial delay in development.
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
 * Auth middleware — verifies Privy token, upserts User record, attaches userId and walletAddress.
 *
 * On first login (user does not exist in DB), a Subscription with plan=FREE is created alongside
 * the User record.
 */
const authMiddleware = t.middleware(async ({ ctx, next }) => {
  const authHeader = ctx.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Missing or invalid authorization header",
    });
  }

  const token = authHeader.slice(7);

  let claims;
  try {
    claims = await privy.verifyAuthToken(token);
  } catch {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid or expired auth token",
    });
  }

  const privyId = claims.userId;

  // Get the user from Privy to extract wallet and email info
  const privyUser = await privy.getUser(privyId);

  const walletAddress =
    privyUser.wallet?.address ??
    privyUser.linkedAccounts?.find(
      (a): a is Extract<typeof a, { type: "wallet" }> => a.type === "wallet",
    )?.address ??
    null;

  const email =
    privyUser.email?.address ??
    privyUser.linkedAccounts?.find(
      (a): a is Extract<typeof a, { type: "email" }> => a.type === "email",
    )?.address ??
    null;

  const displayName =
    privyUser.google?.name ??
    privyUser.apple?.email ??
    email ??
    null;

  // Upsert user record — creates on first login, updates on subsequent
  const user = await ctx.db.user.upsert({
    where: { privyId },
    update: {
      ...(walletAddress && { walletAddress }),
      ...(email && { email }),
      ...(displayName && { displayName }),
    },
    create: {
      privyId,
      walletAddress: walletAddress ?? `pending-${privyId}`,
      email,
      displayName,
      subscription: {
        create: {
          plan: "FREE",
          status: "ACTIVE",
        },
      },
    },
    select: {
      id: true,
      walletAddress: true,
    },
  });

  return next({
    ctx: {
      userId: user.id,
      walletAddress: user.walletAddress,
    },
  });
});

/**
 * Public (unauthenticated) procedure
 *
 * Does not require auth. Used for viewing published surveys, public results, etc.
 */
export const publicProcedure = t.procedure.use(timingMiddleware);

/**
 * Protected (authenticated) procedure
 *
 * Requires a valid Privy token. Verifies the token, upserts the User record,
 * and provides ctx.userId and ctx.walletAddress to the procedure.
 */
export const protectedProcedure = t.procedure
  .use(timingMiddleware)
  .use(authMiddleware);
```

- [ ] **Step 2: Update the RSC tRPC server caller to pass headers**

The file `src/trpc/server.ts` already passes headers correctly. No changes needed — verify:

```bash
cd /Users/bmschwartz/Development/attestly && cat src/trpc/server.ts
```

Confirm it creates context with `headers` from Next.js `headers()` function. The Privy token will be available via the cookie-forwarded `authorization` header.

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/server/api/trpc.ts
git commit -m "feat: rewrite tRPC auth middleware for Privy token verification and user upsert"
```

---

### Task 8: Add a health check router to verify auth works

**Files:**
- Create: `src/server/api/routers/health.ts`
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Create the health check router**

```bash
mkdir -p /Users/bmschwartz/Development/attestly/src/server/api/routers
```

Create `src/server/api/routers/health.ts`:

```ts
import { createTRPCRouter, publicProcedure, protectedProcedure } from "~/server/api/trpc";

export const healthRouter = createTRPCRouter({
  /**
   * Public health check — always returns ok.
   */
  ping: publicProcedure.query(() => {
    return { status: "ok", timestamp: new Date().toISOString() };
  }),

  /**
   * Protected health check — returns ok with the authenticated user's ID and wallet.
   * Used to verify the auth middleware is working correctly.
   */
  whoami: protectedProcedure.query(({ ctx }) => {
    return {
      status: "authenticated",
      userId: ctx.userId,
      walletAddress: ctx.walletAddress,
      timestamp: new Date().toISOString(),
    };
  }),
});
```

- [ ] **Step 2: Register the health router in the app router**

Replace the entire contents of `src/server/api/root.ts` with:

```ts
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { healthRouter } from "~/server/api/routers/health";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  health: healthRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.health.ping();
 */
export const createCaller = createCallerFactory(appRouter);
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/server/api/routers/health.ts src/server/api/root.ts
git commit -m "feat: add health check router with public ping and protected whoami"
```

---

### Task 9: Verify the build compiles

- [ ] **Step 1: Run TypeScript type check**

```bash
cd /Users/bmschwartz/Development/attestly && SKIP_ENV_VALIDATION=1 pnpm typecheck
```

Expected: no errors. If there are type errors related to Privy types, fix them in the relevant files.

Common issues to watch for:
- Privy `User` type may have different property paths than expected. Check `@privy-io/server-auth` types for the exact shape of the user object returned by `privy.getUser()`.
- The `claims` object from `privy.verifyAuthToken()` returns `{ userId: string }` (this is the Privy DID, e.g., `did:privy:...`).

- [ ] **Step 2: Run lint**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm lint
```

Fix any lint errors before proceeding.

- [ ] **Step 3: Fix any issues found and commit**

If fixes were needed:

```bash
cd /Users/bmschwartz/Development/attestly
git add -A
git commit -m "fix: resolve type and lint errors from auth migration"
```

---

### Task 10: Manual smoke test

- [ ] **Step 1: Start the dev server**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm dev
```

Note: The dev server requires valid Privy env vars. If you have placeholder values, the server will start but auth will fail at runtime — this is expected.

- [ ] **Step 2: Verify the public health endpoint**

In a new terminal:

```bash
curl -s http://localhost:3000/api/trpc/health.ping | jq .
```

Expected response (roughly):
```json
{
  "result": {
    "data": {
      "json": {
        "status": "ok",
        "timestamp": "..."
      }
    }
  }
}
```

- [ ] **Step 3: Verify the protected endpoint rejects unauthenticated requests**

```bash
curl -s http://localhost:3000/api/trpc/health.whoami | jq .
```

Expected: UNAUTHORIZED error response.

- [ ] **Step 4: Stop the dev server and commit any final changes**

```bash
cd /Users/bmschwartz/Development/attestly
git add -A
git commit -m "feat: complete auth migration from NextAuth to Privy"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `next-auth` and `@auth/prisma-adapter` are NOT in `package.json`
- [ ] `@privy-io/react-auth` and `@privy-io/server-auth` ARE in `package.json`
- [ ] `src/server/auth/` directory does not exist
- [ ] `src/app/api/auth/` directory does not exist
- [ ] `src/env.js` has `NEXT_PUBLIC_PRIVY_APP_ID` and `PRIVY_APP_SECRET`, no `AUTH_SECRET`
- [ ] `src/app/layout.tsx` wraps children with `PrivyProvider`
- [ ] `src/server/api/trpc.ts` uses Privy token verification, not NextAuth session
- [ ] `src/trpc/react.tsx` sends `Authorization: Bearer <token>` header
- [ ] `SKIP_ENV_VALIDATION=1 pnpm typecheck` passes with no errors
- [ ] `pnpm lint` passes with no errors
- [ ] `health.ping` returns ok (public, no auth needed)
- [ ] `health.whoami` returns UNAUTHORIZED without a token
