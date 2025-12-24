import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as sharp from 'sharp';
import { File, FileStatus, ScanStatus } from '@modules/files/entities/file.entity';
import { MinioService } from '@modules/storage/minio.service';

const execAsync = promisify(exec);

interface FileProcessingJob {
  fileId: string;
  storageKey: string;
  mimeType: string;
}

@Processor('file-processing')
export class FileProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(FileProcessingProcessor.name);
  private readonly tempDir = path.join(os.tmpdir(), 'file-storage');

  constructor(
    @InjectRepository(File)
    private fileRepository: Repository<File>,
    private minioService: MinioService,
    @InjectQueue('file-processing')
    private fileProcessingQueue: Queue,
  ) {
    super();
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async process(job: Job<FileProcessingJob>): Promise<void> {
    const { fileId, storageKey, mimeType } = job.data;
    this.logger.log(`Processing job ${job.name} for file ${fileId}`);

    switch (job.name) {
      case 'virus-scan':
        await this.processVirusScan(fileId, storageKey);
        break;
      case 'thumbnail':
        await this.processThumbnail(fileId, storageKey, mimeType);
        break;
      case 'preview':
        await this.processPreview(fileId, storageKey, mimeType);
        break;
      default:
        this.logger.warn(`Unknown job type: ${job.name}`);
    }
  }

  /**
   * Virus scan job using ClamAV via network socket
   */
  private async processVirusScan(fileId: string, storageKey: string): Promise<void> {
    const file = await this.fileRepository.findOne({ where: { id: fileId } });
    if (!file) return;

    // Skip scanning if SKIP_VIRUS_SCAN is set (for development)
    if (process.env.SKIP_VIRUS_SCAN === 'true') {
      this.logger.log(`Skipping virus scan for ${fileId} (SKIP_VIRUS_SCAN=true)`);
      file.scanStatus = ScanStatus.CLEAN;
      file.status = FileStatus.PROCESSING;
      await this.fileRepository.save(file);
      
      // Queue thumbnail job directly
      this.logger.log(`Queueing thumbnail job for ${fileId} after skipped scan`);
      const thumbJob = await this.fileProcessingQueue.add('thumbnail', {
        fileId,
        storageKey,
        mimeType: file.mimeType,
      });
      this.logger.log(`Thumbnail job queued with ID: ${thumbJob.id}`);
      return;
    }

    const tempFile = path.join(this.tempDir, `${fileId}_scan`);
    const clamavHost = process.env.CLAMAV_HOST || 'clamav';
    const clamavPort = parseInt(process.env.CLAMAV_PORT || '3310');

    try {
      // Download file
      const stream = await this.minioService.getObject('files', storageKey);
      const writeStream = fs.createWriteStream(tempFile);
      await new Promise<void>((resolve, reject) => {
        stream.pipe(writeStream);
        writeStream.on('finish', () => resolve());
        writeStream.on('error', reject);
      });

      // Try to scan with ClamAV via network socket
      let scanResult = 'SKIPPED';
      try {
        const net = await import('net');
        const fileData = fs.readFileSync(tempFile);
        
        scanResult = await new Promise<string>((resolve, reject) => {
          const client = new net.Socket();
          const timeout = setTimeout(() => {
            client.destroy();
            resolve('TIMEOUT');
          }, 30000);

          client.connect(clamavPort, clamavHost, () => {
            // INSTREAM protocol: zINSTREAM\0[size][data]\0\0\0\0
            const command = Buffer.from('zINSTREAM\0');
            client.write(command);
            
            // Send file data
            const sizeBuffer = Buffer.alloc(4);
            sizeBuffer.writeUInt32BE(fileData.length, 0);
            client.write(sizeBuffer);
            client.write(fileData);
            
            // End marker
            const endBuffer = Buffer.alloc(4);
            endBuffer.writeUInt32BE(0, 0);
            client.write(endBuffer);
          });

          let response = '';
          client.on('data', (data) => {
            response += data.toString();
          });

          client.on('end', () => {
            clearTimeout(timeout);
            resolve(response.trim());
          });

          client.on('error', (err) => {
            clearTimeout(timeout);
            this.logger.warn(`ClamAV connection error: ${err.message}`);
            resolve('UNAVAILABLE');
          });
        });
      } catch (connError) {
        this.logger.warn(`ClamAV not available, skipping scan: ${connError}`);
        scanResult = 'UNAVAILABLE';
      }

      // Process result
      if (scanResult.includes('FOUND')) {
        file.scanStatus = ScanStatus.INFECTED;
        file.status = FileStatus.INFECTED;
        file.processingError = 'Virus detected';
        this.logger.warn(`File ${fileId} is INFECTED: ${scanResult}`);
        await this.minioService.deleteObject('files', storageKey);
      } else {
        file.scanStatus = ScanStatus.CLEAN;
        file.status = FileStatus.PROCESSING;
        this.logger.log(`File ${fileId} scan result: ${scanResult.substring(0, 50)}`);
        
        // Queue thumbnail job
        await this.fileProcessingQueue.add('thumbnail', {
          fileId,
          storageKey,
          mimeType: file.mimeType,
        });
      }

      await this.fileRepository.save(file);
    } catch (error) {
      this.logger.error(`Virus scan error for ${fileId}: ${error}`);
      file.scanStatus = ScanStatus.ERROR;
      file.processingError = String(error);
      await this.fileRepository.save(file);
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }


  /**
   * Generate thumbnail for images and videos
   */
  private async processThumbnail(fileId: string, storageKey: string, mimeType: string): Promise<void> {
    this.logger.log(`[Thumbnail] Starting for ${fileId}, mimeType: ${mimeType}`);
    
    const file = await this.fileRepository.findOne({ where: { id: fileId } });
    if (!file) {
      this.logger.warn(`[Thumbnail] File not found: ${fileId}`);
      return;
    }

    const tempFile = path.join(this.tempDir, `${fileId}_thumb_src`);
    const thumbFile = path.join(this.tempDir, `${fileId}_thumb.webp`);

    try {
      // Download original file
      this.logger.log(`[Thumbnail] Downloading file from MinIO: ${storageKey}`);
      const stream = await this.minioService.getObject('files', storageKey);
      const writeStream = fs.createWriteStream(tempFile);
      await new Promise<void>((resolve, reject) => {
        stream.pipe(writeStream);
        writeStream.on('finish', () => resolve());
        writeStream.on('error', reject);
      });
      this.logger.log(`[Thumbnail] File downloaded to: ${tempFile}`);

      const thumbnailKey = `${fileId}/thumb.webp`;
      let thumbnailGenerated = false;

      if (mimeType.startsWith('image/')) {
        // Image thumbnail with sharp
        await sharp(tempFile)
          .resize(200, 200, { fit: 'cover' })
          .webp({ quality: 80 })
          .toFile(thumbFile);
        thumbnailGenerated = true;
      } else if (mimeType.startsWith('video/')) {
        // Video thumbnail with ffmpeg - extract frame at 1 second
        await execAsync(
          `ffmpeg -i "${tempFile}" -ss 00:00:01 -vframes 1 -vf "scale=200:200:force_original_aspect_ratio=increase,crop=200:200" -y "${thumbFile}"`
        );
        // Convert to webp
        await sharp(thumbFile).webp({ quality: 80 }).toFile(thumbFile + '.webp');
        fs.renameSync(thumbFile + '.webp', thumbFile);
        thumbnailGenerated = true;
      } else if (mimeType.startsWith('audio/')) {
        // Audio waveform with ffmpeg
        await execAsync(
          `ffmpeg -i "${tempFile}" -filter_complex "showwavespic=s=200x200:colors=0066cc" -frames:v 1 -y "${thumbFile}"`
        );
        await sharp(thumbFile).webp({ quality: 80 }).toFile(thumbFile + '.webp');
        fs.renameSync(thumbFile + '.webp', thumbFile);
        thumbnailGenerated = true;
      } else {
        // No thumbnail for this type (Office docs, etc.)
        this.logger.log(`[Thumbnail] No thumbnail generation for ${mimeType}, will proceed to preview`);
      }

      if (thumbnailGenerated) {
        // Upload thumbnail to MinIO
        const thumbBuffer = fs.readFileSync(thumbFile);
        await this.minioService.uploadBuffer('thumbnails', thumbnailKey, thumbBuffer, 'image/webp');

        file.thumbnailKey = thumbnailKey;
        await this.fileRepository.save(file);
        this.logger.log(`[Thumbnail] Thumbnail generated and saved for ${fileId}`);
      }

      // ALWAYS queue preview job - even for files without thumbnails (Office docs need PDF preview)
      this.logger.log(`[Thumbnail] Queueing preview job for ${fileId} (mimeType: ${mimeType})`);
      const previewJob = await this.fileProcessingQueue.add('preview', {
        fileId,
        storageKey,
        mimeType,
      });
      this.logger.log(`[Thumbnail] Preview job queued with ID: ${previewJob.id}`);
    } catch (error) {
      this.logger.error(`[Thumbnail] Error for ${fileId}: ${error}`);
      // Still try to queue preview job on thumbnail error
      this.logger.log(`[Thumbnail] Queueing preview job after error for ${fileId}`);
      await this.fileProcessingQueue.add('preview', {
        fileId,
        storageKey,
        mimeType,
      });
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      if (fs.existsSync(thumbFile)) fs.unlinkSync(thumbFile);
    }
  }

  /**
   * Generate preview for documents and videos
   */
  private async processPreview(fileId: string, storageKey: string, mimeType: string): Promise<void> {
    const file = await this.fileRepository.findOne({ where: { id: fileId } });
    if (!file) return;

    // Get file extension based on mime type for Office files
    const getExtension = (mime: string): string => {
      const mimeToExt: Record<string, string> = {
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/vnd.ms-excel': '.xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'application/vnd.ms-powerpoint': '.ppt',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
      };
      return mimeToExt[mime] || '';
    };

    // Add extension for Office files so LibreOffice can detect format
    const ext = this.isOfficeFile(mimeType) ? getExtension(mimeType) : '';
    const tempFile = path.join(this.tempDir, `${fileId}_preview_src${ext}`);
    const previewFile = path.join(this.tempDir, `${fileId}_preview`);

    try {
      // Download original file
      const stream = await this.minioService.getObject('files', storageKey);
      const writeStream = fs.createWriteStream(tempFile);
      await new Promise<void>((resolve, reject) => {
        stream.pipe(writeStream);
        writeStream.on('finish', () => resolve());
        writeStream.on('error', reject);
      });

      const previewKey = `${fileId}/preview`;
      let hasPreview = false;

      if (mimeType === 'application/pdf') {
        // PDF preview - first page as PNG
        await execAsync(
          `pdftoppm -png -f 1 -l 1 -r 150 "${tempFile}" "${previewFile}"`
        );
        const pngFile = `${previewFile}-1.png`;
        if (fs.existsSync(pngFile)) {
          const buffer = fs.readFileSync(pngFile);
          await this.minioService.uploadBuffer('previews', `${previewKey}.png`, buffer, 'image/png');
          file.previewKey = `${previewKey}.png`;
          hasPreview = true;

          // Generate thumbnail from the same PNG preview
          const thumbBuffer = await sharp(buffer)
            .resize(200, 200, { fit: 'cover' })
            .webp({ quality: 80 })
            .toBuffer();
          await this.minioService.uploadBuffer('thumbnails', `${fileId}/thumb.webp`, thumbBuffer, 'image/webp');
          file.thumbnailKey = `${fileId}/thumb.webp`;

          fs.unlinkSync(pngFile);
        }
      } else if (this.isOfficeFile(mimeType)) {
        // Office file - convert to PDF with LibreOffice and save full PDF for preview
        const outputDir = this.tempDir;
        this.logger.log(`Converting Office file to PDF: ${tempFile} (ext: ${ext})`);
        
        try {
          const conversionResult = await execAsync(
            `libreoffice --headless --convert-to pdf --outdir "${outputDir}" "${tempFile}" 2>&1`
          );
          this.logger.log(`LibreOffice output: ${conversionResult.stdout || conversionResult.stderr || 'no output'}`);
          
          // LibreOffice outputs file with same name but .pdf extension
          // For input: {fileId}_preview_src.docx -> output: {fileId}_preview_src.pdf
          const inputBaseName = path.basename(tempFile); // e.g., "uuid_preview_src.docx"
          const outputPdfName = inputBaseName.replace(/\.[^.]+$/, '.pdf'); // e.g., "uuid_preview_src.pdf"
          const expectedPdfPath = path.join(outputDir, outputPdfName);
          
          // Log for debugging
          this.logger.log(`Looking for PDF at: ${expectedPdfPath}`);
          
          // List all files in output dir for debugging
          const allFiles = fs.readdirSync(outputDir);
          this.logger.log(`Files in temp dir: ${allFiles.join(', ')}`);
          
          // Try expected path first, then search
          let pdfFile: string | null = null;
          
          if (fs.existsSync(expectedPdfPath)) {
            pdfFile = expectedPdfPath;
          } else {
            // Search for any PDF with our fileId
            const pdfFiles = allFiles.filter(f => f.includes(fileId) && f.endsWith('.pdf'));
            if (pdfFiles.length > 0) {
              pdfFile = path.join(outputDir, pdfFiles[0]);
            }
          }
          
          if (pdfFile) {
            // Save full PDF for preview
            const pdfBuffer = fs.readFileSync(pdfFile);
            await this.minioService.uploadBuffer('previews', `${previewKey}.pdf`, pdfBuffer, 'application/pdf');
            file.previewKey = `${previewKey}.pdf`;
            hasPreview = true;

            // Generate thumbnail from the converted PDF
            try {
              const previewFile = path.join(this.tempDir, `${fileId}_office_thumb`);
              await execAsync(
                `pdftoppm -png -f 1 -l 1 -r 150 "${pdfFile}" "${previewFile}"`
              );
              const pngFile = `${previewFile}-1.png`;
              if (fs.existsSync(pngFile)) {
                const thumbBuffer = await sharp(pngFile)
                  .resize(200, 200, { fit: 'cover' })
                  .webp({ quality: 80 })
                  .toBuffer();
                await this.minioService.uploadBuffer('thumbnails', `${fileId}/thumb.webp`, thumbBuffer, 'image/webp');
                file.thumbnailKey = `${fileId}/thumb.webp`;
                fs.unlinkSync(pngFile);
              }
            } catch (thumbError) {
              this.logger.warn(`Failed to generate thumbnail for Office file ${fileId}: ${thumbError}`);
            }

            fs.unlinkSync(pdfFile);
            this.logger.log(`Office file converted to PDF preview and thumbnail generated: ${fileId} (${pdfFile})`);
          } else {
            this.logger.warn(`No PDF found for ${fileId}. Expected: ${expectedPdfPath}`);
            this.logger.warn(`Available files: ${allFiles.join(', ')}`);
          }
        } catch (conversionError: any) {
          this.logger.error(`LibreOffice conversion failed for ${fileId}: ${conversionError.message || conversionError}`);
        }
      } else if (mimeType.startsWith('video/')) {
        // Video preview - low-res version
        const mp4File = `${previewFile}.mp4`;
        await execAsync(
          `ffmpeg -i "${tempFile}" -vf "scale=480:-2" -c:v libx264 -preset fast -crf 28 -c:a aac -b:a 64k -movflags +faststart -y "${mp4File}"`
        );
        if (fs.existsSync(mp4File)) {
          const buffer = fs.readFileSync(mp4File);
          await this.minioService.uploadBuffer('previews', `${previewKey}.mp4`, buffer, 'video/mp4');
          file.previewKey = `${previewKey}.mp4`;
          hasPreview = true;
          fs.unlinkSync(mp4File);
        }
      }

      file.hasPreview = hasPreview;
      await this.fileRepository.save(file);
      this.logger.log(`Preview ${hasPreview ? 'generated' : 'skipped'} for ${fileId}`);

      await this.finalize(fileId);
    } catch (error) {
      this.logger.error(`Preview error for ${fileId}: ${error}`);
      await this.finalize(fileId);
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  }


  /**
   * Finalize processing - mark file as ready
   */
  private async finalize(fileId: string): Promise<void> {
    const file = await this.fileRepository.findOne({ where: { id: fileId } });
    if (file && file.status === FileStatus.PROCESSING) {
      file.status = FileStatus.READY;
      await this.fileRepository.save(file);
      this.logger.log(`File ${fileId} is now READY`);
    }
  }

  private isOfficeFile(mimeType: string): boolean {
    const officeTypes = [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ];
    return officeTypes.includes(mimeType);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.name} completed for file ${job.data.fileId}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.name} failed for file ${job.data.fileId}: ${error.message}`);
  }
}
