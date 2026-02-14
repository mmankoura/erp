import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, IsNull } from 'typeorm';
import { BomImportMapping, ColumnMapping } from '../../entities/bom-import-mapping.entity';
import { Material } from '../../entities/material.entity';
import { Product } from '../../entities/product.entity';
import { ResourceType } from '../../entities/bom-item.entity';
import {
  CreateBomImportMappingDto,
  UpdateBomImportMappingDto,
  BomImportUploadDto,
  BomImportCommitDto,
  BomImportItemDto,
  BomImportPreviewResult,
  BomImportParseResult,
} from './dto';
import { BomService } from './bom.service';
import { BomSource } from '../../entities/bom-revision.entity';

@Injectable()
export class BomImportService {
  constructor(
    @InjectRepository(BomImportMapping)
    private readonly mappingRepository: Repository<BomImportMapping>,
    @InjectRepository(Material)
    private readonly materialRepository: Repository<Material>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly bomService: BomService,
  ) {}

  // ============ Import Mapping CRUD ============

  async findAllMappings(): Promise<BomImportMapping[]> {
    return this.mappingRepository.find({
      order: { name: 'ASC' },
    });
  }

  async findMapping(id: string): Promise<BomImportMapping> {
    const mapping = await this.mappingRepository.findOne({ where: { id } });
    if (!mapping) {
      throw new NotFoundException(`Import mapping with ID "${id}" not found`);
    }
    return mapping;
  }

  async createMapping(dto: CreateBomImportMappingDto): Promise<BomImportMapping> {
    // Check for duplicate name
    const existing = await this.mappingRepository.findOne({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`Mapping with name "${dto.name}" already exists`);
    }

    const mapping = this.mappingRepository.create({
      name: dto.name,
      description: dto.description,
      column_mappings: dto.column_mappings as ColumnMapping[],
      has_header_row: dto.has_header_row,
      skip_rows: dto.skip_rows,
      multi_row_designators: dto.multi_row_designators,
      ignore_columns: dto.ignore_columns,
    });
    return this.mappingRepository.save(mapping);
  }

  async updateMapping(
    id: string,
    dto: UpdateBomImportMappingDto,
  ): Promise<BomImportMapping> {
    const mapping = await this.findMapping(id);

    // Check for duplicate name if changing
    if (dto.name && dto.name !== mapping.name) {
      const existing = await this.mappingRepository.findOne({
        where: { name: dto.name },
      });
      if (existing) {
        throw new ConflictException(`Mapping with name "${dto.name}" already exists`);
      }
    }

    Object.assign(mapping, dto);
    return this.mappingRepository.save(mapping);
  }

  async deleteMapping(id: string): Promise<void> {
    const mapping = await this.findMapping(id);
    await this.mappingRepository.remove(mapping);
  }

  // ============ File Parsing ============

  async previewFile(fileContent: string, hasHeaderRow = true, skipRows = 0): Promise<BomImportPreviewResult> {
    const decoded = this.decodeBase64(fileContent);
    const rows = this.parseCSV(decoded);

    // Skip specified rows
    const dataRows = rows.slice(skipRows);

    if (dataRows.length === 0) {
      throw new BadRequestException('File contains no data rows');
    }

    const headers = hasHeaderRow ? dataRows[0] : dataRows[0].map((_, i) => `Column ${i + 1}`);
    const contentRows = hasHeaderRow ? dataRows.slice(1) : dataRows;

    return {
      headers,
      rows: contentRows.slice(0, 20), // Preview first 20 rows
      total_rows: contentRows.length,
      preview_rows: Math.min(20, contentRows.length),
    };
  }

  async parseAndMapFile(dto: BomImportUploadDto): Promise<BomImportParseResult> {
    const decoded = this.decodeBase64(dto.file_content);
    const rows = this.parseCSV(decoded);

    // Get mapping configuration
    let columnMappings: ColumnMapping[];
    let hasHeaderRow = dto.has_header_row ?? true;
    let skipRows = dto.skip_rows ?? 0;
    let multiRowDesignators = dto.multi_row_designators ?? false;

    if (dto.mapping_id) {
      const savedMapping = await this.findMapping(dto.mapping_id);
      columnMappings = savedMapping.column_mappings;
      hasHeaderRow = savedMapping.has_header_row;
      skipRows = savedMapping.skip_rows;
      multiRowDesignators = savedMapping.multi_row_designators;
    } else if (dto.column_mappings) {
      columnMappings = dto.column_mappings as ColumnMapping[];
    } else {
      throw new BadRequestException('Either column_mappings or mapping_id must be provided');
    }

    // Skip specified rows
    const dataRows = rows.slice(skipRows);

    if (dataRows.length === 0) {
      throw new BadRequestException('File contains no data rows');
    }

    const headers = hasHeaderRow ? dataRows[0] : null;
    const contentRows = hasHeaderRow ? dataRows.slice(1) : dataRows;

    // Build column index map
    const columnIndexMap = this.buildColumnIndexMap(headers, columnMappings);

    // Parse rows into items
    const rawItems: Partial<BomImportItemDto>[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < contentRows.length; i++) {
      const row = contentRows[i];
      const rowNumber = i + (hasHeaderRow ? 2 : 1) + skipRows;

      try {
        const item = this.mapRowToItem(row, columnIndexMap, rowNumber);
        if (item) {
          rawItems.push(item);
        }
      } catch (error) {
        errors.push(`Row ${rowNumber}: ${(error as Error).message}`);
      }
    }

    // Handle multi-row reference designators (group by part number)
    const consolidatedItems = multiRowDesignators
      ? this.consolidateMultiRowDesignators(rawItems)
      : rawItems;

    // Match materials by IPN
    const { items, unmatched_parts, matched_count, unmatched_count } =
      await this.matchMaterials(consolidatedItems as BomImportItemDto[], warnings);

    return {
      items,
      warnings,
      errors,
      unmatched_parts,
      matched_count,
      unmatched_count,
    };
  }

  async commitImport(dto: BomImportCommitDto) {
    // Get the product to get its customer_id for new materials
    const product = await this.productRepository.findOne({
      where: { id: dto.product_id },
    });
    if (!product) {
      throw new NotFoundException(`Product with ID "${dto.product_id}" not found`);
    }

    // Validate all items have valid material references
    const materialIds = new Set<string>();
    const ipnToMaterial = new Map<string, Material>();
    const createdMaterials: string[] = [];

    // Look up all materials by IPN, creating if not found
    for (const item of dto.items) {
      let material = await this.materialRepository.findOne({
        where: { internal_part_number: item.internal_part_number },
      });

      if (!material) {
        // Auto-create the material with available data from import
        // Assign the product's customer to the new material
        material = this.materialRepository.create({
          internal_part_number: item.internal_part_number,
          manufacturer: item.manufacturer,
          manufacturer_pn: item.manufacturer_pn,
          description: item.description || item.notes,
          customer_id: product.customer_id, // Auto-assign customer from product
        });
        material = await this.materialRepository.save(material);
        createdMaterials.push(item.internal_part_number);
      }

      materialIds.add(material.id);
      ipnToMaterial.set(item.internal_part_number, material);
    }

    // Create BOM revision with items
    const bomItems = dto.items.map((item, index) => {
      const material = ipnToMaterial.get(item.internal_part_number)!;
      const resourceType = this.parseResourceType(item.resource_type);
      return {
        material_id: material.id,
        alternate_ipn: item.alternate_ipn,
        line_number: item.line_number ?? index + 1,
        reference_designators: item.reference_designators,
        quantity_required: item.quantity_required,
        resource_type: resourceType as ResourceType | undefined,
        polarized: item.polarized ?? false,
        scrap_factor: 0,
        notes: item.notes,
      };
    });

    const revision = await this.bomService.createFullRevision({
      product_id: dto.product_id,
      revision_number: dto.revision_number,
      revision_date: new Date().toISOString(),
      change_summary: dto.change_summary,
      source: BomSource.IMPORT_CLIENT,
      source_filename: dto.source_filename,
      is_active: dto.is_active ?? false,
      items: bomItems,
    });

    return {
      ...revision,
      created_materials: createdMaterials,
    };
  }

  // ============ Helper Methods ============

  private decodeBase64(content: string): string {
    // Handle data URL format (data:text/csv;base64,...)
    const base64Match = content.match(/^data:[^;]+;base64,(.+)$/);
    const base64Content = base64Match ? base64Match[1] : content;

    return Buffer.from(base64Content, 'base64').toString('utf-8');
  }

  private parseCSV(content: string): string[][] {
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    const rows: string[][] = [];

    for (const line of lines) {
      const row = this.parseCSVLine(line);
      rows.push(row);
    }

    return rows;
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
          i++; // Skip next quote
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
    mappings: ColumnMapping[],
  ): Map<string, number> {
    const indexMap = new Map<string, number>();

    for (const mapping of mappings) {
      if (mapping.target_field === 'ignore') continue;

      if (headers) {
        // Find column index by header name
        const index = headers.findIndex(
          h => h.toLowerCase().trim() === mapping.source_column.toLowerCase().trim(),
        );
        if (index !== -1) {
          indexMap.set(mapping.target_field, index);
        }
      } else {
        // Assume source_column is a numeric index
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
  ): Partial<BomImportItemDto> | null {
    const getValue = (field: string): string | undefined => {
      const index = columnMap.get(field);
      if (index !== undefined && index < row.length) {
        const value = row[index].trim();
        return value || undefined;
      }
      return undefined;
    };

    const ipn = getValue('internal_part_number');
    if (!ipn) {
      // Skip rows without IPN
      return null;
    }

    const qtyStr = getValue('quantity_required');
    const qty = qtyStr ? parseFloat(qtyStr) : 1;
    if (isNaN(qty) || qty < 0) {
      throw new Error(`Invalid quantity "${qtyStr}"`);
    }

    return {
      internal_part_number: ipn,
      description: getValue('description'),
      alternate_ipn: getValue('alternate_ipn'),
      manufacturer: getValue('manufacturer'),
      manufacturer_pn: getValue('manufacturer_pn'),
      quantity_required: qty,
      reference_designators: getValue('reference_designators'),
      line_number: getValue('line_number') ? parseInt(getValue('line_number')!, 10) : undefined,
      resource_type: getValue('resource_type'),
      polarized: this.parseBoolean(getValue('polarized')),
      notes: getValue('notes'),
    };
  }

  private consolidateMultiRowDesignators(
    items: Partial<BomImportItemDto>[],
  ): Partial<BomImportItemDto>[] {
    const consolidated = new Map<string, Partial<BomImportItemDto>>();

    for (const item of items) {
      if (!item.internal_part_number) continue;

      const key = item.internal_part_number;
      if (consolidated.has(key)) {
        const existing = consolidated.get(key)!;
        // Combine reference designators
        if (item.reference_designators) {
          existing.reference_designators = existing.reference_designators
            ? `${existing.reference_designators}, ${item.reference_designators}`
            : item.reference_designators;
        }
        // Sum quantities
        existing.quantity_required =
          (existing.quantity_required || 0) + (item.quantity_required || 0);
      } else {
        consolidated.set(key, { ...item });
      }
    }

    return Array.from(consolidated.values());
  }

  private async matchMaterials(
    items: BomImportItemDto[],
    warnings: string[],
  ): Promise<{
    items: BomImportItemDto[];
    unmatched_parts: string[];
    matched_count: number;
    unmatched_count: number;
  }> {
    const allItems: BomImportItemDto[] = [];
    const unmatchedParts: string[] = [];
    let matchedCount = 0;
    let unmatchedCount = 0;

    for (const item of items) {
      // Try exact match first
      let material = await this.materialRepository.findOne({
        where: { internal_part_number: item.internal_part_number, deleted_at: IsNull() },
      });

      // Try case-insensitive match
      if (!material) {
        material = await this.materialRepository.findOne({
          where: { internal_part_number: ILike(item.internal_part_number), deleted_at: IsNull() },
        });
        if (material) {
          warnings.push(
            `Part "${item.internal_part_number}" matched by case-insensitive search to "${material.internal_part_number}"`,
          );
          item.internal_part_number = material.internal_part_number;
        }
      }

      // Include all items - unmatched ones will be created on commit
      allItems.push(item);

      if (material) {
        matchedCount++;
      } else {
        unmatchedParts.push(item.internal_part_number);
        unmatchedCount++;
      }
    }

    return {
      items: allItems,
      unmatched_parts: unmatchedParts,
      matched_count: matchedCount,
      unmatched_count: unmatchedCount,
    };
  }

  private parseBoolean(value: string | undefined): boolean | undefined {
    if (!value) return undefined;
    const lower = value.toLowerCase();
    if (['true', 'yes', '1', 'y'].includes(lower)) return true;
    if (['false', 'no', '0', 'n'].includes(lower)) return false;
    return undefined;
  }

  private parseResourceType(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const upper = value.toUpperCase();
    const validTypes = ['SMT', 'TH', 'MECH', 'PCB', 'DNP'];
    return validTypes.includes(upper) ? upper : undefined;
  }
}
