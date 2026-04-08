/**
 * S3 Offload Utility
 *
 * For internal API responses that exceed Lambda's 6MB payload limit,
 * upload the data to S3 and return a short-lived presigned GET URL.
 * Consumers fetch the presigned URL to retrieve the full payload.
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { gzipSync } from "zlib";

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.INTERNAL_CACHE_BUCKET;
if (!BUCKET) {
  console.warn("[s3-offload] INTERNAL_CACHE_BUCKET not set; uploadAndPresign will fail");
}

// Presigned URL expiry: 10 minutes (scanner refreshes every ~5 min)
const PRESIGN_EXPIRES_SECONDS = 600;

/**
 * Upload JSON data to S3 (gzipped) and return a presigned GET URL.
 *
 * @param key   S3 object key (e.g. "internal/wallet-mappings.json.gz")
 * @param data  The data object to serialize as JSON
 * @returns     Presigned GET URL for the uploaded object
 */
export async function uploadAndPresign(key: string, data: unknown): Promise<string> {
  const json = JSON.stringify(data);
  const compressed = gzipSync(Buffer.from(json, "utf-8"));

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET!,
      Key: key,
      Body: compressed,
      ContentType: "application/gzip",
    })
  );

  return getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: BUCKET!, Key: key }),
    { expiresIn: PRESIGN_EXPIRES_SECONDS }
  );
}
