import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AmlService } from './aml.service';
import {
  ApprovedManufacturer,
  AMLStatus,
} from '../../entities/approved-manufacturer.entity';
import { AuditService } from '../audit/audit.service';
import { createMockRepo, MockRepo } from '../../test-utils/repo-mock';

const buildAml = (overrides: Partial<ApprovedManufacturer> = {}): ApprovedManufacturer =>
  ({
    id: 'aml-1',
    material_id: 'mat-1',
    manufacturer: 'AVX',
    manufacturer_part_number: 'AVX-123',
    status: AMLStatus.PENDING,
    preferred_supplier_id: null,
    approved_by: null,
    approved_at: null,
    priority: 0,
    notes: null,
    created_by: null,
    source: 'MANUAL' as any,
    source_bom_revision_id: null,
    customer_id: null,
    ...overrides,
  }) as ApprovedManufacturer;

describe('AmlService', () => {
  let service: AmlService;
  let repo: MockRepo<ApprovedManufacturer>;
  let audit: any;

  beforeEach(async () => {
    repo = createMockRepo<ApprovedManufacturer>();
    audit = {
      emitCreate: jest.fn(),
      emitDelete: jest.fn(),
      emitStateChange: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AmlService,
        { provide: getRepositoryToken(ApprovedManufacturer), useValue: repo },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(AmlService);
  });

  it('findOne throws NotFound when missing', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
  });

  it('findApprovedByMaterial filters status=APPROVED', async () => {
    (repo.find as jest.Mock).mockResolvedValue([]);
    await service.findApprovedByMaterial('mat-1');
    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { material_id: 'mat-1', status: AMLStatus.APPROVED },
    }));
  });

  describe('create', () => {
    it('rejects duplicate material+manufacturer+MPN', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(buildAml());
      await expect(service.create({
        material_id: 'mat-1',
        manufacturer: 'AVX',
        manufacturer_part_number: 'AVX-123',
      } as any)).rejects.toThrow(ConflictException);
    });

    it('persists with status=PENDING and audits', async () => {
      (repo.findOne as jest.Mock)
        .mockResolvedValueOnce(null) // duplicate check
        .mockResolvedValue(buildAml({ id: 'new' })); // findOne after save
      (repo.save as jest.Mock).mockImplementation((a) => Promise.resolve({ ...a, id: 'new' }));
      await service.create({
        material_id: 'mat-1',
        manufacturer: 'AVX',
        manufacturer_part_number: 'AVX-123',
      } as any);
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
        status: AMLStatus.PENDING,
      }));
      expect(audit.emitCreate).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('detects collision when changing manufacturer to existing record', async () => {
      const a = buildAml();
      (repo.findOne as jest.Mock)
        .mockResolvedValueOnce(a) // findOne(id)
        .mockResolvedValueOnce(buildAml({ id: 'other' })); // duplicate check
      await expect(service.update('aml-1', { manufacturer: 'NEW' } as any))
        .rejects.toThrow(ConflictException);
    });

    it('updates fields and emits state change', async () => {
      const a = buildAml({ status: AMLStatus.PENDING });
      (repo.findOne as jest.Mock).mockResolvedValue(a);
      (repo.save as jest.Mock).mockImplementation((x) => Promise.resolve(x));
      await service.update('aml-1', { status: AMLStatus.APPROVED } as any);
      expect(audit.emitStateChange).toHaveBeenCalled();
      expect(a.status).toBe(AMLStatus.APPROVED);
    });
  });
});
