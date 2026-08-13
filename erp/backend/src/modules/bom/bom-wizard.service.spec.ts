import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { BomWizardService } from './bom-wizard.service';
import { BomWizardRecipe } from '../../entities/bom-wizard-recipe.entity';
import { createMockRepo, MockRepo } from '../../test-utils/repo-mock';

const buildRecipe = (overrides: Partial<BomWizardRecipe> = {}): BomWizardRecipe =>
  ({
    id: 'rec-1',
    name: 'AEGIS multi-row',
    description: null,
    schema_version: 1,
    actions: [{ type: 'fill_down', columns: ['F1'] }],
    created_by: 'mark',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }) as BomWizardRecipe;

describe('BomWizardService', () => {
  let service: BomWizardService;
  let repo: MockRepo<BomWizardRecipe>;

  beforeEach(async () => {
    repo = createMockRepo<BomWizardRecipe>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BomWizardService,
        { provide: getRepositoryToken(BomWizardRecipe), useValue: repo },
      ],
    }).compile();
    service = module.get(BomWizardService);
  });

  /** The name-clash probe runs through the query builder, so tests steer it. */
  const nameClash = (found: BomWizardRecipe | null) => {
    const qb = repo.createQueryBuilder();
    qb.getOne.mockResolvedValue(found);
    return qb;
  };

  describe('findOne', () => {
    it('throws NotFound when missing', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.findOne('rec-x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('persists with defaults and the acting user', async () => {
      nameClash(null);
      (repo.save as jest.Mock).mockImplementation((r) => Promise.resolve(r));

      await service.create(
        { name: '  AEGIS multi-row  ', actions: [{ type: 'fill_down' }] },
        'mark',
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'AEGIS multi-row', // trimmed
          description: null,
          schema_version: 1,
          created_by: 'mark',
        }),
      );
    });

    it('rejects a duplicate name', async () => {
      nameClash(buildRecipe());
      await expect(
        service.create({ name: 'AEGIS multi-row', actions: [] }),
      ).rejects.toThrow(ConflictException);
    });

    it('compares names case-insensitively, matching the unique index', async () => {
      const qb = nameClash(null);
      (repo.save as jest.Mock).mockImplementation((r) => Promise.resolve(r));

      await service.create({ name: 'aegis MULTI-row', actions: [] });

      expect(qb.where).toHaveBeenCalledWith(
        'LOWER(recipe.name) = LOWER(:name)',
        { name: 'aegis MULTI-row' },
      );
    });
  });

  describe('update', () => {
    it('leaves the name check alone when the name is unchanged', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(buildRecipe());
      const qb = nameClash(null);
      (repo.save as jest.Mock).mockImplementation((r) => Promise.resolve(r));

      await service.update('rec-1', { name: 'AEGIS multi-row' });

      expect(qb.getOne).not.toHaveBeenCalled();
    });

    it('excludes itself when checking a renamed recipe', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(buildRecipe());
      const qb = nameClash(null);
      (repo.save as jest.Mock).mockImplementation((r) => Promise.resolve(r));

      await service.update('rec-1', { name: 'Something else' });

      expect(qb.andWhere).toHaveBeenCalledWith('recipe.id != :exceptId', {
        exceptId: 'rec-1',
      });
    });

    it('replaces the action list wholesale', async () => {
      const recipe = buildRecipe();
      (repo.findOne as jest.Mock).mockResolvedValue(recipe);
      (repo.save as jest.Mock).mockImplementation((r) => Promise.resolve(r));

      const actions = [{ type: 'merge_references' }];
      await service.update('rec-1', { actions });

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ actions }),
      );
    });

    it('throws NotFound for an unknown recipe', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.update('rec-x', { name: 'n' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('throws NotFound rather than silently succeeding', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.remove('rec-x')).rejects.toThrow(NotFoundException);
    });

    it('removes an existing recipe', async () => {
      const recipe = buildRecipe();
      (repo.findOne as jest.Mock).mockResolvedValue(recipe);
      await service.remove('rec-1');
      expect(repo.remove).toHaveBeenCalledWith(recipe);
    });
  });
});
