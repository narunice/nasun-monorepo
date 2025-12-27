/**
 * S3 Service for NFT Event CSV Export
 *
 * @description
 * S3 버킷에 CSV 파일을 업로드하고 Presigned URL을 생성하는 서비스
 *
 * @features
 * - upload: CSV 파일 S3 업로드
 * - getPresignedUrl: Presigned URL 생성 (1시간 유효)
 * - S3 버전 관리, 암호화 지원
 *
 * @author Claude Code
 * @created 2025-10-25
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export class S3Service {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(bucketName: string) {
    this.s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-northeast-2' });
    this.bucketName = bucketName;
  }

  /**
   * S3에 CSV 파일 업로드
   *
   * @param key - S3 객체 키 (파일 경로)
   * @param content - CSV 문자열
   * @param metadata - 추가 메타데이터
   * @returns S3 업로드 결과
   */
  async upload(
    key: string,
    content: string,
    metadata?: Record<string, string>
  ): Promise<void> {
    try {
      console.log(`[S3Service] Uploading to s3://${this.bucketName}/${key}`);

      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: content,
          ContentType: 'text/csv',
          ServerSideEncryption: 'AES256', // S3 Managed Encryption
          Metadata: {
            generatedAt: new Date().toISOString(),
            ...metadata,
          },
        })
      );

      console.log(`[S3Service] Upload successful: ${key}`);
    } catch (error: any) {
      console.error('[S3Service] Error uploading to S3:', error);
      throw new Error(`S3_UPLOAD_ERROR: ${error.message}`);
    }
  }

  /**
   * Presigned URL 생성 (다운로드용)
   *
   * @param key - S3 객체 키
   * @param expiresIn - 만료 시간 (초, 기본값: 3600 = 1시간)
   * @returns Presigned URL
   */
  async getPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      console.log(`[S3Service] Generating presigned URL for ${key} (expires in ${expiresIn}s)`);

      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const presignedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn,
      });

      console.log(`[S3Service] Presigned URL generated successfully`);

      return presignedUrl;
    } catch (error: any) {
      console.error('[S3Service] Error generating presigned URL:', error);
      throw new Error(`S3_PRESIGNED_URL_ERROR: ${error.message}`);
    }
  }

  /**
   * S3 객체 URL 생성 (Public Access가 필요함)
   *
   * @param key - S3 객체 키
   * @returns S3 객체 URL
   */
  getPublicUrl(key: string): string {
    const region = process.env.AWS_REGION || 'ap-northeast-2';
    return `https://${this.bucketName}.s3.${region}.amazonaws.com/${key}`;
  }
}
