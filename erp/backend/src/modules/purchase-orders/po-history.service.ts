import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PoHistory } from '../../entities/po-history.entity';
import * as XLSX from 'xlsx';

@Injectable()
export class PoHistoryService {
  private readonly logger = new Logger(PoHistoryService.name);

  constructor(
    @InjectRepository(PoHistory)
    private readonly poHistoryRepository: Repository<PoHistory>,
  ) {}

  /**
   * Import SPO sheet from the vendor PO record Excel file.
   */
  async importFromExcel(buffer: Buffer): Promise<{ imported: number }> {
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    // Look for SPO sheet
    const sheetName = workbook.SheetNames.find(
      (name) => name.toUpperCase() === 'SPO',
    );
    if (!sheetName) {
      throw new BadRequestException(
        `Sheet "SPO" not found. Available sheets: ${workbook.SheetNames.join(', ')}`,
      );
    }

    const sheet = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
    });

    if (rows.length < 2) {
      throw new BadRequestException('SPO sheet is empty or has no data rows');
    }

    // Skip header row
    const dataRows = rows.slice(1).filter((row) => {
      // Skip empty rows (no PO number)
      return row[0] && String(row[0]).trim() !== '';
    });

    // SPO columns: PO#, DATE, SUPPLIER, AT&A#, MFR, MPN, Description, QTY, Mounting Type, Packaging, Customer, Unit Price, VALUE CDN/US, COMMENTS
    const entities: Partial<PoHistory>[] = dataRows.map((row) => {
      const orderDate = this.parseExcelDate(row[1]);
      const quantity = this.parseNumber(row[7]);
      const unitPrice = this.parseNumber(row[11]);

      return {
        po_number: String(row[0]).trim(),
        order_date: orderDate,
        supplier: this.trimOrNull(row[2]),
        ipn: this.trimOrNull(row[3]),
        manufacturer: this.trimOrNull(row[4]),
        mpn: this.trimOrNull(row[5]),
        description: this.trimOrNull(row[6]),
        quantity,
        mounting_type: this.trimOrNull(row[8]),
        packaging: this.trimOrNull(row[9]),
        customer: this.trimOrNull(row[10]),
        unit_price: unitPrice,
        currency: this.trimOrNull(row[12]),
        comments: this.trimOrNull(row[13]),
      };
    });

    // Batch insert in chunks of 500
    const chunkSize = 500;
    let imported = 0;
    for (let i = 0; i < entities.length; i += chunkSize) {
      const chunk = entities.slice(i, i + chunkSize);
      await this.poHistoryRepository.save(
        chunk.map((e) => this.poHistoryRepository.create(e)),
      );
      imported += chunk.length;
    }

    this.logger.log(`Imported ${imported} PO history records from SPO sheet`);
    return { imported };
  }

  /**
   * Search/list all PO history with optional text search.
   */
  async findAll(search?: string): Promise<PoHistory[]> {
    if (!search || search.trim() === '') {
      return this.poHistoryRepository.find({
        order: { order_date: 'DESC', po_number: 'ASC' },
      });
    }

    const q = search.trim().toLowerCase();

    return this.poHistoryRepository
      .createQueryBuilder('ph')
      .where(
        `LOWER(ph.po_number) LIKE :q OR
         LOWER(ph.supplier) LIKE :q OR
         LOWER(ph.ipn) LIKE :q OR
         LOWER(ph.mpn) LIKE :q OR
         LOWER(ph.description) LIKE :q OR
         LOWER(ph.manufacturer) LIKE :q OR
         LOWER(ph.customer) LIKE :q OR
         LOWER(ph.comments) LIKE :q`,
        { q: `%${q}%` },
      )
      .orderBy('ph.order_date', 'DESC')
      .addOrderBy('ph.po_number', 'ASC')
      .getMany();
  }

  /**
   * Get count of history records.
   */
  async count(): Promise<number> {
    return this.poHistoryRepository.count();
  }

  // ==================== Helpers ====================

  private parseExcelDate(value: any): Date | null {
    if (!value) return null;
    // Excel serial date number
    if (typeof value === 'number') {
      const date = new Date((value - 25569) * 86400 * 1000);
      if (!isNaN(date.getTime())) return date;
    }
    // String date
    if (typeof value === 'string') {
      const date = new Date(value);
      if (!isNaN(date.getTime())) return date;
    }
    return null;
  }

  private parseNumber(value: any): number | null {
    if (value === '' || value === null || value === undefined) return null;
    const num = parseFloat(String(value));
    return isNaN(num) ? null : num;
  }

  private trimOrNull(value: any): string | null {
    if (value === '' || value === null || value === undefined) return null;
    const str = String(value).replace(/\r\n/g, ' ').replace(/\n/g, ' ').trim();
    return str === '' ? null : str;
  }
}
