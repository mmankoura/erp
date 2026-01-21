import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { BomRevision } from '../../entities/bom-revision.entity';
import { BomItem } from '../../entities/bom-item.entity';
import { Product } from '../../entities/product.entity';
import {
  CreateBomRevisionDto,
  UpdateBomRevisionDto,
  CreateBomItemDto,
  UpdateBomItemDto,
  CreateFullBomRevisionDto,
} from './dto';
import { AuditService } from '../audit/audit.service';
import {
  AuditEventType,
  AuditEntityType,
} from '../../entities/audit-event.entity';

export interface BomDiffResult {
  added: BomItem[];
  removed: BomItem[];
  changed: Array<{
    material_id: string;
    material_part_number: string;
    field: string;
    old_value: any;
    new_value: any;
  }>;
  unchanged: number;
}

@Injectable()
export class BomService {
  constructor(
    @InjectRepository(BomRevision)
    private readonly revisionRepository: Repository<BomRevision>,
    @InjectRepository(BomItem)
    private readonly itemRepository: Repository<BomItem>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  // ============ Revision Methods ============

  async findAllRevisions(): Promise<BomRevision[]> {
    return this.revisionRepository.find({
      relations: ['product'],
      order: { created_at: 'DESC' },
    });
  }

  async findRevisionsByProduct(productId: string): Promise<BomRevision[]> {
    return this.revisionRepository.find({
      where: { product_id: productId },
      relations: ['product'],
      order: { created_at: 'DESC' },
    });
  }

  async findRevision(id: string): Promise<BomRevision> {
    const revision = await this.revisionRepository.findOne({
      where: { id },
      relations: ['product', 'items', 'items.material'],
    });
    if (!revision) {
      throw new NotFoundException(`BOM revision with ID "${id}" not found`);
    }
    return revision;
  }

  async findActiveRevision(productId: string): Promise<BomRevision | null> {
    return this.revisionRepository.findOne({
      where: { product_id: productId, is_active: true },
      relations: ['items', 'items.material'],
    });
  }

  async createRevision(dto: CreateBomRevisionDto): Promise<BomRevision> {
    // Verify product exists
    const product = await this.productRepository.findOne({
      where: { id: dto.product_id },
    });
    if (!product) {
      throw new NotFoundException(
        `Product with ID "${dto.product_id}" not found`,
      );
    }

    // Check for duplicate revision number
    const existing = await this.revisionRepository.findOne({
      where: { product_id: dto.product_id, revision_number: dto.revision_number },
    });
    if (existing) {
      throw new ConflictException(
        `Revision "${dto.revision_number}" already exists for this product`,
      );
    }

    const revision = this.revisionRepository.create({
      ...dto,
      revision_date: new Date(dto.revision_date),
    });

    const saved = await this.revisionRepository.save(revision);

    // Emit audit event for revision creation
    await this.auditService.emitCreate(
      AuditEventType.BOM_REVISION_CREATED,
      AuditEntityType.BOM_REVISION,
      saved.id,
      {
        product_id: dto.product_id,
        revision_number: dto.revision_number,
        source: dto.source,
        is_active: dto.is_active,
      },
      undefined,
      { source_filename: dto.source_filename },
    );

    // If this is set as active, update product and deactivate others
    if (dto.is_active) {
      await this.activateRevision(saved.id);
    }

    return this.findRevision(saved.id);
  }

  async createFullRevision(dto: CreateFullBomRevisionDto): Promise<BomRevision> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Create revision
      const revisionDto: CreateBomRevisionDto = {
        product_id: dto.product_id,
        revision_number: dto.revision_number,
        revision_date: dto.revision_date,
        change_summary: dto.change_summary,
        source: dto.source,
        source_filename: dto.source_filename,
        is_active: false, // We'll activate at the end if needed
      };

      // Verify product exists
      const product = await queryRunner.manager.findOne(Product, {
        where: { id: dto.product_id },
      });
      if (!product) {
        throw new NotFoundException(
          `Product with ID "${dto.product_id}" not found`,
        );
      }

      // Check for duplicate revision number
      const existing = await queryRunner.manager.findOne(BomRevision, {
        where: { product_id: dto.product_id, revision_number: dto.revision_number },
      });
      if (existing) {
        throw new ConflictException(
          `Revision "${dto.revision_number}" already exists for this product`,
        );
      }

      const revision = queryRunner.manager.create(BomRevision, {
        ...revisionDto,
        revision_date: new Date(dto.revision_date),
      });
      const savedRevision = await queryRunner.manager.save(revision);

      // Create items
      for (const itemDto of dto.items) {
        const item = queryRunner.manager.create(BomItem, {
          ...itemDto,
          bom_revision_id: savedRevision.id,
        });
        await queryRunner.manager.save(item);
      }

      // Activate if requested
      if (dto.is_active) {
        // Deactivate other revisions
        await queryRunner.manager.update(
          BomRevision,
          { product_id: dto.product_id, is_active: true },
          { is_active: false },
        );
        // Activate this one
        savedRevision.is_active = true;
        await queryRunner.manager.save(savedRevision);
        // Update product
        await queryRunner.manager.update(
          Product,
          { id: dto.product_id },
          { active_bom_revision_id: savedRevision.id },
        );
      }

      await queryRunner.commitTransaction();

      // Emit audit event for full revision creation (after commit)
      await this.auditService.emitCreate(
        AuditEventType.BOM_REVISION_CREATED,
        AuditEntityType.BOM_REVISION,
        savedRevision.id,
        {
          product_id: dto.product_id,
          revision_number: dto.revision_number,
          source: dto.source,
          is_active: dto.is_active,
          item_count: dto.items.length,
        },
        undefined,
        { source_filename: dto.source_filename },
      );

      return this.findRevision(savedRevision.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async updateRevision(
    id: string,
    dto: UpdateBomRevisionDto,
  ): Promise<BomRevision> {
    const revision = await this.findRevision(id);

    // If updating revision number, check for conflicts
    if (dto.revision_number && dto.revision_number !== revision.revision_number) {
      const existing = await this.revisionRepository.findOne({
        where: {
          product_id: revision.product_id,
          revision_number: dto.revision_number,
        },
      });
      if (existing) {
        throw new ConflictException(
          `Revision "${dto.revision_number}" already exists for this product`,
        );
      }
    }

    Object.assign(revision, dto);
    if (dto.revision_date) {
      revision.revision_date = new Date(dto.revision_date);
    }

    await this.revisionRepository.save(revision);

    if (dto.is_active === true) {
      await this.activateRevision(id);
    }

    return this.findRevision(id);
  }

  async deleteRevision(id: string): Promise<void> {
    const revision = await this.findRevision(id);

    if (revision.is_active) {
      // Clear the product's active revision reference
      await this.productRepository.update(
        { id: revision.product_id },
        { active_bom_revision_id: null },
      );
    }

    // Capture data for audit before deletion
    const revisionData = {
      product_id: revision.product_id,
      revision_number: revision.revision_number,
      source: revision.source,
      is_active: revision.is_active,
      item_count: revision.items?.length ?? 0,
    };

    await this.revisionRepository.remove(revision);

    // Emit audit event for deletion
    await this.auditService.emitDelete(
      AuditEventType.BOM_REVISION_DELETED,
      AuditEntityType.BOM_REVISION,
      id,
      revisionData,
    );
  }

  async activateRevision(id: string): Promise<BomRevision> {
    const revision = await this.findRevision(id);

    // Find the currently active revision (if any)
    const previousActive = await this.revisionRepository.findOne({
      where: { product_id: revision.product_id, is_active: true },
    });

    // Deactivate all other revisions for this product
    await this.revisionRepository.update(
      { product_id: revision.product_id },
      { is_active: false },
    );

    // Activate this revision
    revision.is_active = true;
    await this.revisionRepository.save(revision);

    // Update product's active revision reference
    await this.productRepository.update(
      { id: revision.product_id },
      { active_bom_revision_id: id },
    );

    // Emit audit event for revision activation
    await this.auditService.emitStateChange(
      AuditEventType.BOM_REVISION_ACTIVATED,
      AuditEntityType.BOM_REVISION,
      id,
      {
        was_active: false,
        previous_active_revision_id: previousActive?.id ?? null,
        previous_active_revision_number: previousActive?.revision_number ?? null,
      },
      {
        is_active: true,
        revision_number: revision.revision_number,
      },
      undefined,
      { product_id: revision.product_id },
    );

    return this.findRevision(id);
  }

  // ============ Item Methods ============

  async findItemsByRevision(revisionId: string): Promise<BomItem[]> {
    return this.itemRepository.find({
      where: { bom_revision_id: revisionId },
      relations: ['material'],
      order: { line_number: 'ASC' },
    });
  }

  async addItem(revisionId: string, dto: CreateBomItemDto): Promise<BomItem> {
    // Verify revision exists
    await this.findRevision(revisionId);

    const item = this.itemRepository.create({
      ...dto,
      bom_revision_id: revisionId,
    });

    const saved = await this.itemRepository.save(item);
    const result = await this.itemRepository.findOne({
      where: { id: saved.id },
      relations: ['material'],
    });
    return result!;
  }

  async updateItem(itemId: string, dto: UpdateBomItemDto): Promise<BomItem> {
    const item = await this.itemRepository.findOne({
      where: { id: itemId },
      relations: ['material'],
    });
    if (!item) {
      throw new NotFoundException(`BOM item with ID "${itemId}" not found`);
    }

    Object.assign(item, dto);
    await this.itemRepository.save(item);

    const result = await this.itemRepository.findOne({
      where: { id: itemId },
      relations: ['material'],
    });
    return result!;
  }

  async removeItem(itemId: string): Promise<void> {
    const item = await this.itemRepository.findOne({ where: { id: itemId } });
    if (!item) {
      throw new NotFoundException(`BOM item with ID "${itemId}" not found`);
    }
    await this.itemRepository.remove(item);
  }

  // ============ Comparison Methods ============

  async compareRevisions(
    revisionId1: string,
    revisionId2: string,
  ): Promise<BomDiffResult> {
    const [rev1, rev2] = await Promise.all([
      this.findRevision(revisionId1),
      this.findRevision(revisionId2),
    ]);

    if (rev1.product_id !== rev2.product_id) {
      throw new BadRequestException(
        'Cannot compare revisions from different products',
      );
    }

    const items1Map = new Map(
      rev1.items.map((item) => [item.material_id, item]),
    );
    const items2Map = new Map(
      rev2.items.map((item) => [item.material_id, item]),
    );

    const added: BomItem[] = [];
    const removed: BomItem[] = [];
    const changed: BomDiffResult['changed'] = [];
    let unchanged = 0;

    // Find items in rev2 that are not in rev1 (added)
    for (const [materialId, item2] of items2Map) {
      if (!items1Map.has(materialId)) {
        added.push(item2);
      }
    }

    // Find items in rev1 that are not in rev2 (removed) or changed
    for (const [materialId, item1] of items1Map) {
      if (!items2Map.has(materialId)) {
        removed.push(item1);
      } else {
        const item2 = items2Map.get(materialId)!;
        const changes = this.compareItems(item1, item2);
        if (changes.length > 0) {
          changes.forEach((change) => {
            changed.push({
              material_id: materialId,
              material_part_number: item1.material?.internal_part_number || '',
              ...change,
            });
          });
        } else {
          unchanged++;
        }
      }
    }

    return { added, removed, changed, unchanged };
  }

  private compareItems(
    item1: BomItem,
    item2: BomItem,
  ): Array<{ field: string; old_value: any; new_value: any }> {
    const changes: Array<{ field: string; old_value: any; new_value: any }> = [];
    const fieldsToCompare = [
      'quantity_required',
      'reference_designators',
      'resource_type',
      'polarized',
      'scrap_factor',
      'notes',
    ];

    for (const field of fieldsToCompare) {
      const val1 = item1[field as keyof BomItem];
      const val2 = item2[field as keyof BomItem];
      if (val1 !== val2) {
        changes.push({ field, old_value: val1, new_value: val2 });
      }
    }

    return changes;
  }

  // ============ Copy/Clone Methods ============

  async copyRevision(
    sourceRevisionId: string,
    newRevisionNumber: string,
    changeSummary?: string,
  ): Promise<BomRevision> {
    const sourceRevision = await this.findRevision(sourceRevisionId);

    const dto: CreateFullBomRevisionDto = {
      product_id: sourceRevision.product_id,
      revision_number: newRevisionNumber,
      revision_date: new Date().toISOString(),
      change_summary: changeSummary || `Copied from revision ${sourceRevision.revision_number}`,
      source: sourceRevision.source,
      is_active: false,
      items: sourceRevision.items.map((item) => ({
        material_id: item.material_id,
        line_number: item.line_number ?? undefined,
        reference_designators: item.reference_designators ?? undefined,
        quantity_required: Number(item.quantity_required),
        resource_type: item.resource_type ?? undefined,
        polarized: item.polarized,
        scrap_factor: Number(item.scrap_factor),
        notes: item.notes ?? undefined,
      })),
    };

    return this.createFullRevision(dto);
  }
}
