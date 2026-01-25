import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import {
  InventoryLot,
  PackageType,
  LotStatus,
} from '../../entities/inventory-lot.entity';
import {
  InventoryTransaction,
  TransactionType,
  ReferenceType,
  OwnerType,
} from '../../entities/inventory-transaction.entity';
import { Material } from '../../entities/material.entity';
import {
  InventoryImportPreviewDto,
  InventoryImportParseDto,
  InventoryImportCommitDto,
  InventoryImportItemDto,
  InventoryImportPreviewResult,
  InventoryImportParseResult,
  InventoryImportCommitResult,
  InventoryColumnMappingDto,
} from './dto/inventory-import.dto';

@Injectable()
export class InventoryImportService {
  constructor(
    @InjectRepository(InventoryLot)
    private readonly lotRepository: Repository<InventoryLot>,
    @InjectRepository(InventoryTransaction)
    private readonly transactionRepository: Repository<InventoryTransaction>,
    @InjectRepository(Material)
    private readonly materialRepository: Repository<Material>,
    private readonly dataSource: DataSource,
  ) {}

  // ==================== FILE PREVIEW ====================

  async previewFile(
    dto: InventoryImportPreviewDto,
  ): Promise<InventoryImportPreviewResult> {
    const decoded = this.decodeBase64(dto.file_content);
    const rows = this.parseCSV(decoded);

    const skipRows = dto.skip_rows ?? 0;
    const dataRows = rows.slice(skipRows);

    if (dataRows.length === 0) {
      throw new BadRequestException('File contains no data rows');
    }

    const hasHeaderRow = dto.has_header_row ?? true;
    const headers = hasHeaderRow
      ? dataRows[0]
      : dataRows[0].map((_, i) => `Column ${i + 1}`);
    const contentRows = hasHeaderRow ? dataRows.slice(1) : dataRows;

    return {
      headers,
      rows: contentRows.slice(0, 20),
      total_rows: contentRows.length,
      preview_rows: Math.min(20, contentRows.length),
    };
  }

  // ==================== PARSE AND MAP ====================

  async parseAndMapFile(
    dto: InventoryImportParseDto,
  ): Promise<InventoryImportParseResult> {
    const decoded = this.decodeBase64(dto.file_content);
    const rows = this.parseCSV(decoded);

    const skipRows = dto.skip_rows ?? 0;
    const hasHeaderRow = dto.has_header_row ?? true;
    const dataRows = rows.slice(skipRows);

    if (dataRows.length === 0) {
      throw new BadRequestException('File contains no data rows');
    }

    const headers = hasHeaderRow ? dataRows[0] : null;
    const contentRows = hasHeaderRow ? dataRows.slice(1) : dataRows;

    const columnIndexMap = this.buildColumnIndexMap(
      headers,
      dto.column_mappings,
    );

    const items: InventoryImportItemDto[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];
    const uidSet = new Set<string>();
    const duplicateUids: string[] = [];

    for (let i = 0; i < contentRows.length; i++) {
      const row = contentRows[i];
      const rowNumber = i + (hasHeaderRow ? 2 : 1) + skipRows;

      try {
        const item = this.mapRowToItem(row, columnIndexMap, rowNumber);
        if (item) {
          if (uidSet.has(item.uid)) {
            duplicateUids.push(item.uid);
            errors.push(`Row ${rowNumber}: Duplicate UID "${item.uid}" in file`);
          } else {
            uidSet.add(item.uid);
            items.push(item);
          }
        }
      } catch (error) {
        errors.push(`Row ${rowNumber}: ${(error as Error).message}`);
      }
    }

    // Check for existing UIDs in database
    if (items.length > 0) {
      const uidsToCheck = items.map((item) => item.uid);
      const existingLots = await this.lotRepository.find({
        where: { uid: In(uidsToCheck) },
        select: ['uid'],
      });
      const existingUidSet = new Set(existingLots.map((l) => l.uid));
      for (const item of items) {
        if (existingUidSet.has(item.uid)) {
          errors.push(`UID "${item.uid}" already exists in inventory`);
          duplicateUids.push(item.uid);
        }
      }
    }

    // Match materials by IPN
    const matchResult = await this.matchMaterials(items, warnings);

    return {
      items: matchResult.items,
      warnings,
      errors,
      unmatched_ipns: matchResult.unmatched_ipns,
      matched_count: matchResult.matched_count,
      unmatched_count: matchResult.unmatched_count,
      duplicate_uids: [...new Set(duplicateUids)],
      total_quantity: items.reduce((sum, item) => sum + item.quantity, 0),
    };
  }

  // ==================== COMMIT IMPORT ====================

  async commitImport(
    dto: InventoryImportCommitDto,
  ): Promise<InventoryImportCommitResult> {
    const createdMaterials: string[] = [];
    const lotIds: string[] = [];
    let totalQuantity = 0;

    // Validate no duplicate UIDs in database
    const uids = dto.items.map((item) => item.uid);
    const existingLots = await this.lotRepository.find({
      where: { uid: In(uids) },
    });
    if (existingLots.length > 0) {
      throw new BadRequestException(
        `UIDs already exist: ${existingLots.map((l) => l.uid).join(', ')}`,
      );
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const lotsToCreate: InventoryLot[] = [];
      const transactionsToCreate: InventoryTransaction[] = [];

      for (const item of dto.items) {
        // Look up or create material
        let material = await manager.findOne(Material, {
          where: { internal_part_number: item.ipn },
        });

        if (!material) {
          material = manager.create(Material, {
            internal_part_number: item.ipn,
          });
          material = await manager.save(Material, material);
          createdMaterials.push(item.ipn);
        }

        const packageType = this.parsePackageType(item.package_type);

        const lot = manager.create(InventoryLot, {
          uid: item.uid,
          material_id: material.id,
          quantity: item.quantity,
          initial_quantity: item.quantity,
          package_type: packageType,
          po_reference: item.po_reference || null,
          unit_cost: item.unit_cost || null,
          expiration_date: item.expiration_date
            ? new Date(item.expiration_date)
            : null,
          notes: item.notes || null,
          received_date: new Date(),
          status: LotStatus.ACTIVE,
        });
        lotsToCreate.push(lot);
        totalQuantity += item.quantity;
      }

      const savedLots = await manager.save(InventoryLot, lotsToCreate);

      for (const lot of savedLots) {
        lotIds.push(lot.id);

        const transaction = manager.create(InventoryTransaction, {
          material_id: lot.material_id,
          transaction_type: TransactionType.RECEIPT,
          quantity: lot.quantity,
          reference_type: ReferenceType.INITIAL_STOCK,
          reason: `Import: Lot ${lot.uid}`,
          lot_id: lot.id,
          unit_cost: lot.unit_cost,
          created_by: dto.created_by || null,
          owner_type: dto.owner_type || OwnerType.COMPANY,
          owner_id: dto.owner_id || null,
        });
        transactionsToCreate.push(transaction);
      }

      await manager.save(InventoryTransaction, transactionsToCreate);

      return {
        lots_created: savedLots.length,
        transactions_created: transactionsToCreate.length,
      };
    });

    return {
      ...result,
      total_quantity: totalQuantity,
      created_materials: createdMaterials,
      lot_ids: lotIds,
    };
  }

  // ==================== LOT QUERIES ====================

  async findAllLots(filters?: {
    status?: string;
    materialId?: string;
  }): Promise<InventoryLot[]> {
    const where: Record<string, unknown> = {};

    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.materialId) {
      where.material_id = filters.materialId;
    }

    return this.lotRepository.find({
      where,
      relations: ['material', 'material.customer', 'supplier'],
      order: { created_at: 'DESC' },
    });
  }

  async findLot(id: string): Promise<InventoryLot> {
    const lot = await this.lotRepository.findOne({
      where: { id },
      relations: ['material', 'material.customer', 'supplier'],
    });

    if (!lot) {
      throw new NotFoundException(`Lot with ID "${id}" not found`);
    }

    return lot;
  }

  async findLotByUid(uid: string): Promise<InventoryLot> {
    const lot = await this.lotRepository.findOne({
      where: { uid },
      relations: ['material', 'material.customer', 'supplier'],
    });

    if (!lot) {
      throw new NotFoundException(`Lot with UID "${uid}" not found`);
    }

    return lot;
  }

  // ==================== HELPER METHODS ====================

  private decodeBase64(content: string): string {
    const base64Match = content.match(/^data:[^;]+;base64,(.+)$/);
    const base64Content = base64Match ? base64Match[1] : content;
    return Buffer.from(base64Content, 'base64').toString('utf-8');
  }

  private parseCSV(content: string): string[][] {
    const lines = content.split(/\r?\n/).filter((line) => line.trim());
    return lines.map((line) => this.parseCSVLine(line));
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
    }
    result.push(current.trim());
    return result;
  }

  private buildColumnIndexMap(
    headers: string[] | null,
    mappings: InventoryColumnMappingDto[],
  ): Map<string, number> {
    const indexMap = new Map<string, number>();

    for (const mapping of mappings) {
      if (mapping.target_field === 'ignore') continue;

      if (headers) {
        const index = headers.findIndex(
          (h) =>
            h.toLowerCase().trim() ===
            mapping.source_column.toLowerCase().trim(),
        );
        if (index !== -1) {
          indexMap.set(mapping.target_field, index);
        }
      } else {
        // Treat source_column as numeric index
        const index = parseInt(mapping.source_column, 10);
        if (!isNaN(index)) {
          indexMap.set(mapping.target_field, index);
        }
      }
    }
    return indexMap;
  }

  private mapRowToItem(
    row: string[],
    columnMap: Map<string, number>,
    rowNumber: number,
  ): InventoryImportItemDto | null {
    const getValue = (field: string): string | undefined => {
      const index = columnMap.get(field);
      if (index !== undefined && index < row.length) {
        const value = row[index].trim();
        return value || undefined;
      }
      return undefined;
    };

    const uid = getValue('uid');
    const ipn = getValue('ipn');
    const qtyStr = getValue('quantity');

    if (!uid) {
      throw new Error('Missing UID');
    }
    if (!ipn) {
      throw new Error('Missing IPN');
    }

    // Parse quantity - handle comma-separated thousands
    const cleanQtyStr = qtyStr?.replace(/,/g, '') || '0';
    const qty = parseFloat(cleanQtyStr);
    if (isNaN(qty) || qty < 0) {
      throw new Error(`Invalid quantity "${qtyStr}"`);
    }

    return {
      uid,
      ipn,
      quantity: qty,
      package_type: getValue('package_type'),
      po_reference: getValue('po_reference'),
      unit_cost: getValue('unit_cost')
        ? parseFloat(getValue('unit_cost')!.replace(/,/g, ''))
        : undefined,
      expiration_date: getValue('expiration_date'),
      notes: getValue('notes'),
    };
  }

  private async matchMaterials(
    items: InventoryImportItemDto[],
    warnings: string[],
  ): Promise<{
    items: InventoryImportItemDto[];
    unmatched_ipns: string[];
    matched_count: number;
    unmatched_count: number;
  }> {
    const unmatchedIpns: string[] = [];
    let matchedCount = 0;
    let unmatchedCount = 0;

    // Batch fetch all materials
    const uniqueIpns = [...new Set(items.map((item) => item.ipn))];
    const materials = await this.materialRepository.find({
      where: { deleted_at: undefined as unknown as Date },
    });

    const materialByIpn = new Map<string, Material>();
    const materialByIpnLower = new Map<string, Material>();

    for (const material of materials) {
      materialByIpn.set(material.internal_part_number, material);
      materialByIpnLower.set(
        material.internal_part_number.toLowerCase(),
        material,
      );
    }

    for (const item of items) {
      // Try exact match
      let material = materialByIpn.get(item.ipn);

      // Try case-insensitive
      if (!material) {
        material = materialByIpnLower.get(item.ipn.toLowerCase());
        if (material) {
          warnings.push(
            `IPN "${item.ipn}" matched case-insensitively to "${material.internal_part_number}"`,
          );
          item.ipn = material.internal_part_number;
        }
      }

      if (material) {
        item.material_id = material.id;
        item.material_matched = true;
        matchedCount++;
      } else {
        if (!unmatchedIpns.includes(item.ipn)) {
          unmatchedIpns.push(item.ipn);
        }
        item.material_matched = false;
        unmatchedCount++;
      }
    }

    return {
      items,
      unmatched_ipns: unmatchedIpns,
      matched_count: matchedCount,
      unmatched_count: unmatchedCount,
    };
  }

  private parsePackageType(value: string | undefined): PackageType {
    if (!value) return PackageType.TR;
    const upper = value.toUpperCase().trim();
    const validTypes: Record<string, PackageType> = {
      TR: PackageType.TR,
      REEL: PackageType.REEL,
      'T&R': PackageType.TR,
      TAPE: PackageType.TR,
      TUBE: PackageType.TUBE,
      TRAY: PackageType.TRAY,
      BAG: PackageType.BAG,
      BOX: PackageType.BOX,
      BULK: PackageType.BULK,
    };
    return validTypes[upper] || PackageType.OTHER;
  }
}
