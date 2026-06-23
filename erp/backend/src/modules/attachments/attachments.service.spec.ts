import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { Attachment } from '../../entities/attachment.entity';
import { createMockRepo, MockRepo } from '../../test-utils/repo-mock';

// Preserve real `fs` for TypeORM internals; only stub the promise methods we use.
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: jest.fn().mockResolvedValue(undefined),
      writeFile: jest.fn().mockResolvedValue(undefined),
      access: jest.fn().mockResolvedValue(undefined),
    },
  };
});

const buildFile = (overrides: Partial<Express.Multer.File> = {}): Express.Multer.File =>
  ({
    fieldname: 'file',
    originalname: 'spec.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: Buffer.from('hello world'),
    destination: '',
    filename: '',
    path: '',
    stream: undefined as any,
    ...overrides,
  }) as Express.Multer.File;

describe('AttachmentsService', () => {
  let service: AttachmentsService;
  let repo: MockRepo<Attachment>;
  let fs: any;

  beforeEach(async () => {
    repo = createMockRepo<Attachment>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentsService,
        { provide: getRepositoryToken(Attachment), useValue: repo },
      ],
    }).compile();
    service = module.get(AttachmentsService);
    fs = require('fs').promises;
    jest.clearAllMocks();
    fs.mkdir.mockResolvedValue(undefined);
    fs.writeFile.mockResolvedValue(undefined);
    fs.access.mockResolvedValue(undefined);
  });

  describe('upload', () => {
    it('rejects when no file provided', async () => {
      await expect(
        service.upload(null as any, 'material', 'mat-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unknown entity type (path traversal protection)', async () => {
      await expect(
        service.upload(buildFile(), 'arbitrary-evil', 'id'),
      ).rejects.toThrow(/Invalid entity type/);
    });

    it('rejects entity_id containing path separators', async () => {
      await expect(
        service.upload(buildFile(), 'material', '../etc/passwd'),
      ).rejects.toThrow(/Invalid entity ID/);
    });

    it('rejects entity_id containing backslashes', async () => {
      await expect(
        service.upload(buildFile(), 'material', 'a\\b'),
      ).rejects.toThrow(/Invalid entity ID/);
    });

    it('rejects oversized files (>10MB)', async () => {
      await expect(
        service.upload(
          buildFile({ size: 11 * 1024 * 1024 }),
          'material',
          'mat-1',
        ),
      ).rejects.toThrow(/File size/);
    });

    it('rejects disallowed MIME types', async () => {
      await expect(
        service.upload(
          buildFile({ mimetype: 'application/x-shellscript' }),
          'material',
          'mat-1',
        ),
      ).rejects.toThrow(/not allowed/);
    });

    it('hashes content with SHA-256 and persists attachment record', async () => {
      (repo.save as jest.Mock).mockImplementation((a) => Promise.resolve({ id: 'att-1', ...a }));
      const file = buildFile();
      const out = await service.upload(file, 'material', 'mat-1', 'alice', 'note');
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
        entity_type: 'material',
        entity_id: 'mat-1',
        filename: 'spec.pdf',
        mime_type: 'application/pdf',
        size_bytes: 1024,
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        uploaded_by: 'alice',
        notes: 'note',
      }));
      expect(out.id).toBe('att-1');
      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('sanitizes the filename to prevent injection', async () => {
      (repo.save as jest.Mock).mockImplementation((a) => Promise.resolve(a));
      const f = buildFile({ originalname: 'evil/../weird name.pdf' });
      await service.upload(f, 'material', 'mat-1');
      const writeArgs = fs.writeFile.mock.calls[0][0];
      // The path component for filename should never contain "../" or unfriendly chars
      expect(writeArgs).not.toMatch(/\.\.\//);
    });
  });

  describe('findOne / findByEntity', () => {
    it('findOne throws NotFound if missing', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
    });

    it('findByEntity orders by uploaded_at DESC', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);
      await service.findByEntity('material', 'mat-1');
      expect(repo.find).toHaveBeenCalledWith({
        where: { entity_type: 'material', entity_id: 'mat-1' },
        order: { uploaded_at: 'DESC' },
      });
    });
  });

  describe('getFilePath', () => {
    it('returns full path when file exists on disk', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue({
        id: 'a1',
        storage_key: 'material/m1/file.pdf',
      });
      const out = await service.getFilePath('a1');
      expect(out.fullPath).toContain('material');
      expect(out.fullPath).toContain('file.pdf');
    });

    it('throws NotFound when file is missing on disk', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue({
        id: 'a1',
        storage_key: 'material/m1/file.pdf',
      });
      fs.access.mockRejectedValue(new Error('ENOENT'));
      await expect(service.getFilePath('a1')).rejects.toThrow(/File not found/);
    });
  });

  describe('softDelete', () => {
    it('marks deleted_at and deleted_by then saves', async () => {
      const att: any = { id: 'a1', deleted_at: null, deleted_by: null };
      (repo.findOne as jest.Mock).mockResolvedValue(att);
      (repo.save as jest.Mock).mockResolvedValue(att);
      await service.softDelete('a1', 'alice');
      expect(att.deleted_by).toBe('alice');
      expect(att.deleted_at).toBeInstanceOf(Date);
      expect(repo.save).toHaveBeenCalledWith(att);
    });
  });
});
