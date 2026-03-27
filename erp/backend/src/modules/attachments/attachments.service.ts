import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attachment } from '../../entities/attachment.entity';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

const UPLOADS_ROOT = path.join(process.cwd(), 'uploads');

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_ENTITY_TYPES = [
  'material',
  'product',
  'order',
  'purchase_order',
  'supplier',
  'customer',
  'receiving_inspection',
  'cycle_count',
  'kitting_list',
];

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectRepository(Attachment)
    private readonly attachmentRepository: Repository<Attachment>,
  ) {}

  async upload(
    file: Express.Multer.File,
    entityType: string,
    entityId: string,
    uploadedBy?: string,
    notes?: string,
  ): Promise<Attachment> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Sanitize entity type and entity ID to prevent path traversal
    if (!ALLOWED_ENTITY_TYPES.includes(entityType)) {
      throw new BadRequestException(`Invalid entity type "${entityType}"`);
    }
    if (/[\/\\\.]{2,}/.test(entityId) || /[\/\\]/.test(entityId)) {
      throw new BadRequestException('Invalid entity ID');
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size ${file.size} exceeds maximum of ${MAX_FILE_SIZE} bytes`,
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type "${file.mimetype}" is not allowed. Allowed: PDF, PNG, JPG, DOC, DOCX, XLS, XLSX`,
      );
    }

    // Compute SHA256
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    // Build storage path
    const storageDir = path.join(entityType, entityId);
    const fullDir = path.join(UPLOADS_ROOT, storageDir);
    await fs.mkdir(fullDir, { recursive: true });

    const safeFilename = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const storagePath = path.join(storageDir, safeFilename);
    const fullPath = path.join(UPLOADS_ROOT, storagePath);

    await fs.writeFile(fullPath, file.buffer);

    const attachment = this.attachmentRepository.create({
      entity_type: entityType,
      entity_id: entityId,
      filename: file.originalname,
      mime_type: file.mimetype,
      size_bytes: file.size,
      sha256,
      storage_key: storagePath,
      uploaded_by: uploadedBy ?? null,
      notes: notes ?? null,
    });

    return this.attachmentRepository.save(attachment);
  }

  async findByEntity(
    entityType: string,
    entityId: string,
  ): Promise<Attachment[]> {
    return this.attachmentRepository.find({
      where: {
        entity_type: entityType,
        entity_id: entityId,
      },
      order: { uploaded_at: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Attachment> {
    const attachment = await this.attachmentRepository.findOne({
      where: { id },
    });
    if (!attachment) {
      throw new NotFoundException(`Attachment with ID "${id}" not found`);
    }
    return attachment;
  }

  async getFilePath(id: string): Promise<{ attachment: Attachment; fullPath: string }> {
    const attachment = await this.findOne(id);
    const fullPath = path.join(UPLOADS_ROOT, attachment.storage_key);

    try {
      await fs.access(fullPath);
    } catch {
      throw new NotFoundException('File not found on disk');
    }

    return { attachment, fullPath };
  }

  async softDelete(id: string, deletedBy: string): Promise<void> {
    const attachment = await this.findOne(id);
    attachment.deleted_at = new Date();
    attachment.deleted_by = deletedBy;
    await this.attachmentRepository.save(attachment);
  }
}
