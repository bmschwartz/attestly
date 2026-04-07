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
