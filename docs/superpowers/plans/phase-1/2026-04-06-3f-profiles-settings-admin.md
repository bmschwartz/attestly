# User Profiles, Settings & Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build public user profiles, profile settings (display name, avatar, bio), and the admin page for featured survey management.

**Architecture:** User and profile tRPC routers for public profile data and settings mutations. Admin router restricted to `isAdmin` users. Avatar images uploaded to Cloudflare R2 (S3-compatible) via a server-side tRPC mutation; the R2 public URL is stored in `User.avatar`.

**Tech Stack:** Next.js App Router, tRPC 11, Prisma 7, Tailwind CSS, Zod, `@aws-sdk/client-s3` (for Cloudflare R2)

**Spec reference:** `docs/superpowers/specs/2026-04-05-public-survey-discovery-design.md`

---

### Task 1: Create user router (public profile data)

**Files:**
- Create: `src/server/api/routers/user.ts`
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Create the user router**

```typescript
import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

export const userRouter = createTRPCRouter({
  getProfile: publicProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          displayName: true,
          avatar: true,
          bio: true,
          walletAddress: true,
          createdAt: true,
        },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const [surveyCount, responseCount] = await Promise.all([
        ctx.db.survey.count({
          where: {
            creatorId: input.userId,
            status: { in: ["PUBLISHED", "CLOSED"] },
            isPrivate: false,
            accessMode: "OPEN",
          },
        }),
        ctx.db.response.count({
          where: {
            survey: {
              creatorId: input.userId,
              isPrivate: false,
              accessMode: "OPEN",
            },
            status: "SUBMITTED",
            deletedAt: null,
          },
        }),
      ]);

      return { ...user, surveyCount, responseCount };
    }),

  getPublicSurveys: publicProcedure
    .input(z.object({
      userId: z.string().uuid(),
      cursor: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const surveys = await ctx.db.survey.findMany({
        where: {
          creatorId: input.userId,
          status: { in: ["PUBLISHED", "CLOSED"] },
          isPrivate: false,
          accessMode: "OPEN",
        },
        include: {
          creator: { select: { id: true, displayName: true, walletAddress: true } },
          _count: { select: { responses: { where: { status: "SUBMITTED", deletedAt: null } } } },
        },
        orderBy: { publishedAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      const hasMore = surveys.length > input.limit;
      const items = hasMore ? surveys.slice(0, -1) : surveys;
      return { items, nextCursor: hasMore ? items[items.length - 1]?.id : undefined };
    }),

  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.subscription.findUnique({
      where: { userId: ctx.userId },
      select: { plan: true, status: true, currentPeriodEnd: true },
    });
  }),
});
```

- [ ] **Step 2: Register in root.ts**

```typescript
import { userRouter } from "~/server/api/routers/user";
// Add: user: userRouter
```

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/user.ts src/server/api/root.ts
git commit -m "feat: add user router (getProfile, getPublicSurveys, getSubscription)"
```

---

### Task 2: Create user profile page

**Files:**
- Create: `src/app/u/[userId]/page.tsx`

- [ ] **Step 1: Create the profile page**

```typescript
import { api } from "~/trpc/server";
import { notFound } from "next/navigation";
import { SurveyCard } from "~/app/_components/survey-card";

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const profile = await api.user.getProfile({ userId });

  if (!profile) {
    notFound();
  }

  const surveys = await api.user.getPublicSurveys({ userId });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {/* Profile Header */}
      <div className="flex items-start gap-4">
        <div className="h-16 w-16 flex-shrink-0 rounded-full bg-gray-200 overflow-hidden">
          {profile.avatar ? (
            <img src={profile.avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl text-gray-400">
              {(profile.displayName ?? "?")[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <div>
          <h1 className="text-xl font-bold">
            {profile.displayName ?? profile.walletAddress.slice(0, 10) + "..."}
          </h1>
          <p className="text-sm text-gray-500">{profile.walletAddress}</p>
          {profile.bio && <p className="mt-1 text-sm text-gray-600">{profile.bio}</p>}
          <p className="mt-2 text-xs text-gray-400">
            Joined {new Date(profile.createdAt).toLocaleDateString()} ·{" "}
            {profile.surveyCount} surveys · {profile.responseCount} total responses
          </p>
        </div>
      </div>

      {/* Surveys */}
      <section className="mt-8">
        <h2 className="font-medium text-gray-600">Surveys</h2>
        <div className="mt-3 space-y-3">
          {surveys.items.map((s) => (
            <SurveyCard key={s.id} survey={s} />
          ))}
          {surveys.items.length === 0 && (
            <p className="text-gray-400">No public surveys yet</p>
          )}
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/u/[userId]/page.tsx
git commit -m "feat: add user profile page"
```

---

### Task 3: Create profile settings page

**Files:**
- Create: `src/server/api/routers/profile.ts`
- Create: `src/lib/r2.ts`
- Create: `src/app/settings/profile/page.tsx`
- Modify: `src/server/api/root.ts`

**Environment variables required:**
- `CLOUDFLARE_R2_ACCOUNT_ID`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_BUCKET_NAME`

- [ ] **Step 0: Install `@aws-sdk/client-s3`**

```bash
pnpm add @aws-sdk/client-s3
```

- [ ] **Step 1a: Create R2 client helper**

```typescript
// src/lib/r2.ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "~/env";

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Upload a buffer to Cloudflare R2 and return the public URL.
 */
export async function uploadToR2(opts: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<string> {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: env.CLOUDFLARE_R2_BUCKET_NAME,
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType,
    }),
  );

  // Return the public URL (requires public access on the bucket or a custom domain)
  return `https://${env.CLOUDFLARE_R2_BUCKET_NAME}.${env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.dev/${opts.key}`;
}
```

- [ ] **Step 1b: Create profile router**

```typescript
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { uploadToR2 } from "~/lib/r2";

const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const profileRouter = createTRPCRouter({
  update: protectedProcedure
    .input(z.object({
      displayName: z.string().max(50).optional(),
      bio: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.user.update({
        where: { id: ctx.userId },
        data: {
          ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
          ...(input.bio !== undefined ? { bio: input.bio } : {}),
        },
      });
    }),

  uploadAvatar: protectedProcedure
    .input(z.object({
      /** Raw file bytes encoded as base64 (NOT a data URL). */
      fileBase64: z.string().refine(
        (s) => {
          const sizeInBytes = Math.ceil((s.length * 3) / 4);
          return sizeInBytes <= MAX_AVATAR_SIZE;
        },
        "File must be under 2 MB",
      ),
      /** MIME type of the uploaded file. */
      contentType: z.enum(ALLOWED_MIME_TYPES),
    }))
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const ext = input.contentType.split("/")[1]; // jpeg | png | webp
      const key = `avatars/${ctx.userId}/${Date.now()}.${ext}`;

      const avatarUrl = await uploadToR2({
        key,
        body: buffer,
        contentType: input.contentType,
      });

      return ctx.db.user.update({
        where: { id: ctx.userId },
        data: { avatar: avatarUrl },
      });
    }),
});
```

- [ ] **Step 2: Create profile settings page**

```typescript
"use client";

import { useState, useRef } from "react";
import { api } from "~/trpc/react";
import { usePrivy } from "@privy-io/react-auth";

export default function ProfileSettingsPage() {
  const { user: privyUser } = usePrivy();
  const utils = api.useUtils();

  const { data: profile } = api.user.getProfile.useQuery(
    { userId: "" }, // Will be replaced with actual userId from auth context
    { enabled: false },
  );

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const updateProfile = api.profile.update.useMutation({
    onSuccess: () => utils.user.invalidate(),
  });
  const uploadAvatar = api.profile.uploadAvatar.useMutation({
    onSuccess: () => utils.user.invalidate(),
  });

  function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Image must be under 2MB");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      alert("Only JPEG, PNG, and WebP images are allowed");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ""),
      );
      uploadAvatar.mutate({
        fileBase64: base64,
        contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
      });
    };
    reader.readAsArrayBuffer(file);
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-bold">Profile Settings</h1>

      {/* Avatar */}
      <section className="mt-6">
        <label className="text-sm font-medium text-gray-700">Avatar</label>
        <div className="mt-2 flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-gray-200 overflow-hidden">
            {/* Avatar preview */}
          </div>
          <button
            onClick={() => fileInput.current?.click()}
            className="rounded border px-3 py-1 text-sm"
          >
            Upload
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleAvatarUpload}
            className="hidden"
          />
        </div>
      </section>

      {/* Display Name */}
      <section className="mt-6">
        <label className="text-sm font-medium text-gray-700">Display Name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value.slice(0, 50))}
          className="mt-1 w-full rounded border px-3 py-2"
          placeholder="Your name"
        />
        <p className="mt-1 text-right text-xs text-gray-400">{displayName.length}/50</p>
      </section>

      {/* Bio */}
      <section className="mt-6">
        <label className="text-sm font-medium text-gray-700">Bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, 200))}
          className="mt-1 w-full rounded border px-3 py-2"
          rows={3}
          placeholder="Tell us about yourself"
        />
        <p className="mt-1 text-right text-xs text-gray-400">{bio.length}/200</p>
      </section>

      <button
        onClick={() => updateProfile.mutate({ displayName, bio })}
        className="mt-6 rounded bg-blue-600 px-4 py-2 text-white"
      >
        Save Changes
      </button>

      {/* Read-only fields */}
      <section className="mt-8 border-t pt-6">
        <h2 className="text-sm font-medium text-gray-700">Account Info</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div>
            <dt className="text-gray-500">Wallet Address</dt>
            <dd className="font-mono text-gray-700">{privyUser?.wallet?.address ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Email</dt>
            <dd className="text-gray-700">{privyUser?.email?.address ?? "—"}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Register profile router in root.ts**

```typescript
import { profileRouter } from "~/server/api/routers/profile";
// Add: profile: profileRouter
```

- [ ] **Step 4: Add R2 env vars to `src/env.js` (or `src/env.ts`)**

Add the following server-side env vars to the env schema:

```typescript
CLOUDFLARE_R2_ACCOUNT_ID: z.string().min(1),
CLOUDFLARE_R2_ACCESS_KEY_ID: z.string().min(1),
CLOUDFLARE_R2_SECRET_ACCESS_KEY: z.string().min(1),
CLOUDFLARE_R2_BUCKET_NAME: z.string().min(1),
```

And add them to `runtimeEnv` (if using `@t3-oss/env-nextjs`):

```typescript
CLOUDFLARE_R2_ACCOUNT_ID: process.env.CLOUDFLARE_R2_ACCOUNT_ID,
CLOUDFLARE_R2_ACCESS_KEY_ID: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
CLOUDFLARE_R2_SECRET_ACCESS_KEY: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
CLOUDFLARE_R2_BUCKET_NAME: process.env.CLOUDFLARE_R2_BUCKET_NAME,
```

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/profile.ts src/lib/r2.ts src/app/settings/profile/page.tsx src/server/api/root.ts src/env.js package.json pnpm-lock.yaml
git commit -m "feat: add profile settings page with Cloudflare R2 avatar upload"
```

---

### Task 4: Create admin page

**Files:**
- Create: `src/server/api/routers/admin.ts`
- Create: `src/app/admin/page.tsx`
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Create admin router**

```typescript
import { z } from "zod";
import { type PrismaClient } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

/**
 * Assert the current user is an admin by fetching the isAdmin flag from the database.
 * Throws NOT_FOUND (not FORBIDDEN) to avoid revealing admin routes exist.
 */
async function assertAdmin(ctx: { db: PrismaClient; userId: string }) {
  const user = await ctx.db.user.findUnique({
    where: { id: ctx.userId },
    select: { isAdmin: true },
  });
  if (!user?.isAdmin) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
}

export const adminRouter = createTRPCRouter({
  searchSurveys: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await assertAdmin(ctx);
      return ctx.db.survey.findMany({
        where: {
          status: "PUBLISHED",
          isPrivate: false,
          accessMode: "OPEN",
          title: { contains: input.query, mode: "insensitive" },
        },
        select: { id: true, title: true, slug: true },
        take: 10,
      });
    }),

  featureSurvey: protectedProcedure
    .input(z.object({ surveyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx);
      const featuredCount = await ctx.db.survey.count({
        where: { featuredAt: { not: null } },
      });
      if (featuredCount >= 6) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum 6 featured surveys" });
      }
      return ctx.db.survey.update({
        where: { id: input.surveyId },
        data: { featuredAt: new Date(), featuredOrder: featuredCount },
      });
    }),

  unfeatureSurvey: protectedProcedure
    .input(z.object({ surveyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx);
      return ctx.db.survey.update({
        where: { id: input.surveyId },
        data: { featuredAt: null, featuredOrder: null },
      });
    }),

  reorderFeatured: protectedProcedure
    .input(z.object({
      surveyIds: z.array(z.string().uuid()),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx);
      await ctx.db.$transaction(
        input.surveyIds.map((id, index) =>
          ctx.db.survey.update({
            where: { id },
            data: { featuredOrder: index },
          }),
        ),
      );
      return { success: true };
    }),

  setUserPlan: protectedProcedure
    .input(z.object({
      userId: z.string().uuid(),
      plan: z.enum(["FREE", "PREMIUM", "ENTERPRISE"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx);
      return ctx.db.subscription.update({
        where: { userId: input.userId },
        data: { plan: input.plan },
      });
    }),
});
```

- [ ] **Step 2: Create admin page**

```typescript
"use client";

import { useState } from "react";
import { api } from "~/trpc/react";

export default function AdminPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const featured = api.explore.featured.useQuery();
  const searchResults = api.admin.searchSurveys.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length > 0 },
  );
  const featureSurvey = api.admin.featureSurvey.useMutation();
  const unfeatureSurvey = api.admin.unfeatureSurvey.useMutation();
  const utils = api.useUtils();

  async function handleFeature(surveyId: string) {
    await featureSurvey.mutateAsync({ surveyId });
    await utils.explore.featured.invalidate();
    setSearchQuery("");
  }

  async function handleUnfeature(surveyId: string) {
    await unfeatureSurvey.mutateAsync({ surveyId });
    await utils.explore.featured.invalidate();
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold">Admin</h1>

      <section className="mt-8">
        <h2 className="text-lg font-medium">Featured Surveys</h2>

        {/* Current featured */}
        <div className="mt-4 space-y-2">
          {featured.data?.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded border p-3">
              <span className="text-sm">{s.title}</span>
              <button
                onClick={() => handleUnfeature(s.id)}
                className="text-xs text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
          {featured.data?.length === 0 && (
            <p className="text-sm text-gray-400">No featured surveys</p>
          )}
        </div>

        {/* Add featured */}
        {(featured.data?.length ?? 0) < 6 && (
          <div className="mt-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search surveys to feature..."
              className="w-full rounded border px-3 py-2 text-sm"
            />
            {searchResults.data && searchResults.data.length > 0 && (
              <div className="mt-2 rounded border">
                {searchResults.data.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleFeature(s.id)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Register admin router in root.ts**

```typescript
import { adminRouter } from "~/server/api/routers/admin";
// Add: admin: adminRouter
```

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/admin.ts src/app/admin/page.tsx src/server/api/root.ts
git commit -m "feat: add admin page with featured survey management"
```

---

## Verification Checklist

- [ ] `pnpm typecheck` — no errors
- [ ] `@aws-sdk/client-s3` is listed in `package.json` dependencies
- [ ] `CLOUDFLARE_R2_*` env vars are defined in `src/env.js` and `.env`
- [ ] User profile page renders at `/u/[userId]` with avatar, name, bio, stats, surveys
- [ ] Profile settings at `/settings/profile` — edit name, bio, upload avatar
- [ ] Avatar upload sends raw file bytes (base64-encoded) to the server, which uploads to R2 and stores the public URL in `User.avatar`
- [ ] Uploaded avatar displays correctly on both the settings page and the public profile page
- [ ] Admin page at `/admin` — search, feature/unfeature, max 6 featured
- [ ] Admin routes return 404 for non-admin users
- [ ] User router: getProfile (public), getPublicSurveys (public), getSubscription (protected)
- [ ] Profile router: update, uploadAvatar (both protected)
