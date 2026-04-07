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
