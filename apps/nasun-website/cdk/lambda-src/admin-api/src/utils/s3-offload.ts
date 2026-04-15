/**
 * S3 Offload Utility
 *
 * For internal API responses that exceed Lambda's 6MB payload limit,
 * upload the data to S3 and return a short-lived presigned GET URL.
 * Consumers fetch the presigned URL to retrieve the full payload.
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { gzipSync, gunzipSync } from "zlib";
import { Readable } from "stream";

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.INTERNAL_CACHE_BUCKET;
if (!BUCKET) {
  console.warn("[s3-offload] INTERNAL_CACHE_BUCKET not set; uploadAndPresign will fail");
}

/**
 * Read and decompress gzipped JSON data from S3.
 *
 * @param bucket S3 bucket name
 * @param key    S3 object key
 * @returns      The decompressed JSON string data, or null if not found
 */
export async function getS3Object(bucket: string, key: string): Promise<string | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );

    if (!response.Body) return null;

    // Convert stream to Buffer
    const chunks: Buffer[] = [];
    const stream = response.Body as Readable;
    
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    
    const buffer = Buffer.concat(chunks);
    
    // Check if it's gzipped (starts with 0x1f 0x8b)
    if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
      return gunzipSync(buffer).toString("utf-8");
    }
    
    return buffer.toString("utf-8");
  } catch (err: any) {
    if (err.name === "NoSuchKey") {
      return null;
    }
    console.error(`[s3-offload] Failed to get object ${key} from ${bucket}:`, err);
    throw err;
  }
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

  // Key can be overridden or default to BUCKET
  const targetBucket = BUCKET!;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: targetBucket,
      Key: key,
      Body: compressed,
      ContentType: "application/gzip",
    })
  );

  return getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: targetBucket, Key: key }),
    { expiresIn: PRESIGN_EXPIRES_SECONDS }
  );
}
