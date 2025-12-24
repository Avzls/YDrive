import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private client: Minio.Client;
  private externalClient: Minio.Client; // For generating browser-accessible URLs
  private readonly buckets: {
    files: string;
    thumbnails: string;
    previews: string;
    temp: string;
  };

  constructor(private configService: ConfigService) {
    // Internal client for server-to-server communication
    this.client = new Minio.Client({
      endPoint: this.configService.get('MINIO_ENDPOINT', 'localhost'),
      port: parseInt(this.configService.get('MINIO_PORT', '9000')),
      useSSL: this.configService.get('MINIO_USE_SSL', 'false') === 'true',
      accessKey: this.configService.get('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.configService.get('MINIO_SECRET_KEY', 'minioadmin'),
    });

    // External client for generating browser-accessible presigned URLs
    const externalEndpoint = this.configService.get('MINIO_EXTERNAL_ENDPOINT', 'localhost');
    this.externalClient = new Minio.Client({
      endPoint: externalEndpoint,
      port: parseInt(this.configService.get('MINIO_EXTERNAL_PORT', '9000')),
      useSSL: this.configService.get('MINIO_USE_SSL', 'false') === 'true',
      accessKey: this.configService.get('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.configService.get('MINIO_SECRET_KEY', 'minioadmin'),
    });

    this.buckets = {
      files: this.configService.get('MINIO_BUCKET_FILES', 'files'),
      thumbnails: this.configService.get('MINIO_BUCKET_THUMBNAILS', 'thumbnails'),
      previews: this.configService.get('MINIO_BUCKET_PREVIEWS', 'previews'),
      temp: this.configService.get('MINIO_BUCKET_TEMP', 'temp'),
    };
  }

  async onModuleInit() {
    await this.ensureBucketsExist();
  }

  private async ensureBucketsExist() {
    for (const [name, bucket] of Object.entries(this.buckets)) {
      const exists = await this.client.bucketExists(bucket);
      if (!exists) {
        await this.client.makeBucket(bucket);
        this.logger.log(`Created bucket: ${bucket}`);
      }
    }
  }

  /**
   * Generate presigned PUT URL for file upload (browser accessible)
   * Uses externalClient configured with localhost endpoint for valid signatures
   */
  async getPresignedUploadUrl(
    objectKey: string,
    expirySeconds: number = 3600,
  ): Promise<string> {
    // Use externalClient (localhost) so signature matches what browser will use
    return this.externalClient.presignedPutObject(this.buckets.temp, objectKey, expirySeconds);
  }

  /**
   * Generate presigned GET URL for file download (browser accessible)
   * Uses externalClient configured with localhost endpoint for valid signatures
   */
  async getPresignedDownloadUrl(
    bucket: 'files' | 'thumbnails' | 'previews',
    objectKey: string,
    expirySeconds: number = 3600,
    fileName?: string,
  ): Promise<string> {
    const headers: Record<string, string> = {};
    if (fileName) {
      headers['response-content-disposition'] = `attachment; filename="${encodeURIComponent(fileName)}"`;
    }
    // Use externalClient (localhost) so signature matches what browser will use
    return this.externalClient.presignedGetObject(this.buckets[bucket], objectKey, expirySeconds, headers);
  }

  /**
   * Check if object exists in bucket
   */
  async objectExists(bucket: 'files' | 'thumbnails' | 'previews' | 'temp', objectKey: string): Promise<boolean> {
    try {
      await this.client.statObject(this.buckets[bucket], objectKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Move object from temp to files bucket
   */
  async moveFromTemp(tempKey: string, destKey: string): Promise<void> {
    // Copy from temp to files bucket
    await this.client.copyObject(
      this.buckets.files,
      destKey,
      `/${this.buckets.temp}/${tempKey}`,
      new Minio.CopyConditions(),
    );
    // Delete from temp
    await this.client.removeObject(this.buckets.temp, tempKey);
  }

  /**
   * Upload file buffer directly to bucket
   * Used for direct API uploads (bypass presigned URL)
   */
  async uploadBuffer(
    bucket: 'files' | 'thumbnails' | 'previews' | 'temp',
    objectKey: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.client.putObject(
      this.buckets[bucket],
      objectKey,
      buffer,
      buffer.length,
      { 'Content-Type': contentType },
    );
  }

  /**
   * Delete object from bucket
   */
  async deleteObject(bucket: 'files' | 'thumbnails' | 'previews' | 'temp', objectKey: string): Promise<void> {
    await this.client.removeObject(this.buckets[bucket], objectKey);
  }

  /**
   * Get object stream for processing
   */
  async getObject(bucket: 'files' | 'thumbnails' | 'previews' | 'temp', objectKey: string): Promise<NodeJS.ReadableStream> {
    return this.client.getObject(this.buckets[bucket], objectKey);
  }

  /**
   * Get object as Buffer (for ZIP creation, etc.)
   */
  async getObjectBuffer(bucket: 'files' | 'thumbnails' | 'previews' | 'temp', objectKey: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.buckets[bucket], objectKey);
    const chunks: Buffer[] = [];
    
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  /**
   * Get object stats (size, etag, etc.)
   */
  async getObjectStat(bucket: 'files' | 'thumbnails' | 'previews' | 'temp', objectKey: string) {
    return this.client.statObject(this.buckets[bucket], objectKey);
  }

  /**
   * Copy object within or across buckets
   */
  async copyObject(
    sourceBucket: 'files' | 'thumbnails' | 'previews' | 'temp',
    sourceKey: string,
    destBucket: 'files' | 'thumbnails' | 'previews' | 'temp',
    destKey: string,
  ): Promise<void> {
    await this.client.copyObject(
      this.buckets[destBucket],
      destKey,
      `/${this.buckets[sourceBucket]}/${sourceKey}`,
      new Minio.CopyConditions(),
    );
  }
}
