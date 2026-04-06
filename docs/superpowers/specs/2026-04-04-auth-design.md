# Auth & User Management Design

## Overview

Attestly uses Privy as its sole authentication system, replacing NextAuth entirely. Privy handles social logins, embedded wallet creation (MPC, non-custodial), and token issuance. The server verifies Privy auth tokens on each tRPC request and syncs user records to Postgres.

## Login Providers

- **Google** — one-click OAuth login
- **Apple** — one-click OAuth login
- **Email** — magic link (covers users without social accounts)

Additional providers (Discord, GitHub, Twitter/X, SMS) can be added later via the Privy dashboard with zero code changes.

## Architecture

```
Browser (Client)                    Next.js Server                 Privy Cloud
┌─────────────────┐                ┌─────────────────┐           ┌──────────────┐
│ PrivyProvider    │───login───────>│                 │           │ User mgmt    │
│                  │<──token────────│                 │──verify──>│ Wallet (MPC) │
│ Login Modal      │                │ tRPC Router     │<──valid───│ Token issue  │
│ (Google/Apple/   │                │                 │           └──────────────┘
│  Email)          │                │ Auth Middleware  │
│                  │──Bearer token─>│ (verify token)  │
│ Embedded Wallet  │                │                 │
│ (auto-created)   │                │ User Sync       │
│                  │                │ (upsert from    │
│ tRPC Client      │                │  Privy claims)  │
└─────────────────┘                │                 │
                                   │ publicProcedure  │
                                   │ protectedProcedure│
                                   │        │         │
                                   │        ▼         │
                                   │   PostgreSQL     │
                                   └─────────────────┘
```

### Client Side

- `PrivyProvider` wraps the app in the root layout, configured with app ID and login methods
- Privy React SDK provides the login modal, auth state hooks (`usePrivy`), and wallet hooks
- On successful login, Privy creates an embedded wallet (MPC, non-custodial) silently — user never sees wallet UI
- Privy issues an auth token stored client-side
- tRPC client sends the Privy auth token in the `Authorization` header on every request

### Server Side

- `@privy-io/server-auth` verifies the Privy token on incoming tRPC requests
- Auth middleware extracts user claims (privyId, walletAddress, email) from the verified token
- User record is upserted to Postgres on each authenticated request (creates on first login, updates on subsequent)
- User ID and wallet address are attached to the tRPC context for use in procedures

### tRPC Procedures

- **`publicProcedure`** — no auth required. Used for:
  - Viewing published survey descriptions and previews
  - Viewing public survey results
  - Looking up surveys by slug

- **`protectedProcedure`** — requires valid Privy token. Used for:
  - Creating and editing draft surveys
  - Starting and submitting survey responses
  - Viewing creator dashboards and results
  - Any action that requires knowing who the user is

## Auth Flows

### Creator Flow

1. Visits attestly.com
2. Clicks "Sign in"
3. Privy modal appears: Google / Apple / Email
4. Embedded wallet created silently
5. User record synced to Postgres (upsert by privyId)
6. Redirected to dashboard

Creators authenticate upfront. They have persistent accounts with dashboards, draft management, and results access.

### Respondent Flow

1. Clicks a survey link (e.g., `attestly.com/s/my-survey`)
2. Sees survey description and preview (no auth — `publicProcedure`)
3. Clicks "Start Survey"
4. Privy modal appears: Google / Apple / Email
5. Embedded wallet created silently
6. User record synced to Postgres
7. Response created with `IN_PROGRESS` status
8. Fills out answers — progress auto-saved to Postgres
9. Clicks "Submit" — response status set to `SUBMITTED`, signed with wallet (Phase 2+)

Respondents authenticate at survey start (not view) so their progress can be saved. If a respondent returns later, they pick up their `IN_PROGRESS` response. A respondent who later wants to create surveys uses the same Privy account — same login, same wallet.

## User Sync

On each authenticated tRPC request, the auth middleware:

1. Verifies the Privy token
2. Extracts claims: `privyId`, `walletAddress`, `email`, `displayName`
3. Upserts a User record in Postgres keyed by `privyId`
4. Attaches the internal `userId` and `walletAddress` to the tRPC context

This ensures the local User table stays in sync with Privy without requiring webhooks or background sync jobs.

## Environment Variables

```
NEXT_PUBLIC_PRIVY_APP_ID=<from Privy dashboard>
PRIVY_APP_SECRET=<from Privy dashboard>
```

Both must be added to `src/env.js` validation (server-side for secret, client-side for app ID).

## Migration from NextAuth

### Remove

- `next-auth` and `@auth/prisma-adapter` packages
- `src/server/auth/` directory (config.ts, index.ts)
- `src/app/api/auth/[...nextauth]/` route
- NextAuth session types and module augmentation in `src/server/auth/config.ts`
- `AUTH_SECRET`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET` from env config
- NextAuth-related Prisma models (Account, Session, VerificationToken) if any exist

### Add

- `@privy-io/react-auth` — client SDK, login modal, wallet hooks
- `@privy-io/server-auth` — server-side token verification
- `PrivyProvider` wrapper in `src/app/layout.tsx`
- Auth middleware in `src/server/api/trpc.ts` — replaces the existing `protectedProcedure` implementation
- `NEXT_PUBLIC_PRIVY_APP_ID` and `PRIVY_APP_SECRET` env vars to `src/env.js`

## Security Considerations

- Privy tokens are verified server-side on every request — no client-side trust
- Embedded wallets are non-custodial (MPC key sharding) — Attestly never has access to private keys
- User records are keyed by internal UUID, not Privy ID — auth provider can be swapped without foreign key migrations
- Rate limiting should be applied to auth-dependent endpoints to prevent abuse
