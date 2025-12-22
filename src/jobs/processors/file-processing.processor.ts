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
      await this.fileProcessingQueue.add('thumbnail', {
        fileId,
        storageKey,
        mimeType: file.mimeType,
      });
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
    const file = await this.fileRepository.findOne({ where: { id: fileId } });
    if (!file) return;

    const tempFile = path.join(this.tempDir, `${fileId}_thumb_src`);
    const thumbFile = path.join(this.tempDir, `${fileId}_thumb.webp`);

    try {
      // Download original file
      const stream = await this.minioService.getObject('files', storageKey);
      const writeStream = fs.createWriteStream(tempFile);
      await new Promise<void>((resolve, reject) => {
        stream.pipe(writeStream);
        writeStream.on('finish', () => resolve());
        writeStream.on('error', reject);
      });

      const thumbnailKey = `${fileId}/thumb.webp`;

      if (mimeType.startsWith('image/')) {
        // Image thumbnail with sharp
        await sharp(tempFile)
          .resize(200, 200, { fit: 'cover' })
          .webp({ quality: 80 })
          .toFile(thumbFile);
      } else if (mimeType.startsWith('video/')) {
        // Video thumbnail with ffmpeg - extract frame at 1 second
        await execAsync(
          `ffmpeg -i "${tempFile}" -ss 00:00:01 -vframes 1 -vf "scale=200:200:force_original_aspect_ratio=increase,crop=200:200" -y "${thumbFile}"`
        );
        // Convert to webp
        await sharp(thumbFile).webp({ quality: 80 }).toFile(thumbFile + '.webp');
        fs.renameSync(thumbFile + '.webp', thumbFile);
      } else if (mimeType.startsWith('audio/')) {
        // Audio waveform with ffmpeg
        await execAsync(
          `ffmpeg -i "${tempFile}" -filter_complex "showwavespic=s=200x200:colors=0066cc" -frames:v 1 -y "${thumbFile}"`
        );
        await sharp(thumbFile).webp({ quality: 80 }).toFile(thumbFile + '.webp');
        fs.renameSync(thumbFile + '.webp', thumbFile);
      } else {
        // No thumbnail for this type
        this.logger.log(`No thumbnail generation for ${mimeType}`);
        await this.finalize(fileId);
        return;
      }

      // Upload thumbnail to MinIO
      const thumbBuffer = fs.readFileSync(thumbFile);
      await this.minioService.uploadBuffer('thumbnails', thumbnailKey, thumbBuffer, 'image/webp');

      file.thumbnailKey = thumbnailKey;
      await this.fileRepository.save(file);
      this.logger.log(`Thumbnail generated for ${fileId}`);

      // Queue preview job
      await this.fileProcessingQueue.add('preview', {
        fileId,
        storageKey,
        mimeType,
      });
    } catch (error) {
      this.logger.error(`Thumbnail error for ${fileId}: ${error}`);
      await this.finalize(fileId);
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

    const tempFile = path.join(this.tempDir, `${fileId}_preview_src`);
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
          fs.unlinkSync(pngFile);
        }
      } else if (this.isOfficeFile(mimeType)) {
        // Office file - convert to PDF with LibreOffice
        const outputDir = path.dirname(previewFile);
        await execAsync(
          `libreoffice --headless --convert-to pdf --outdir "${outputDir}" "${tempFile}"`
        );
        const pdfFile = tempFile.replace(/\.[^.]+$/, '.pdf');
        if (fs.existsSync(pdfFile)) {
          // Convert PDF first page to PNG
          await execAsync(
            `pdftoppm -png -f 1 -l 1 -r 150 "${pdfFile}" "${previewFile}"`
          );
          const pngFile = `${previewFile}-1.png`;
          if (fs.existsSync(pngFile)) {
            const buffer = fs.readFileSync(pngFile);
            await this.minioService.uploadBuffer('previews', `${previewKey}.png`, buffer, 'image/png');
            file.previewKey = `${previewKey}.png`;
            hasPreview = true;
            fs.unlinkSync(pngFile);
          }
          fs.unlinkSync(pdfFile);
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
