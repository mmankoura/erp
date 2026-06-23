import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PoHistoryService } from './po-history.service';
import { PoHistory } from '../../entities/po-history.entity';
import { createMockRepo, MockRepo } from '../../test-utils/repo-mock';

describe('PoHistoryService', () => {
  let service: PoHistoryService;
  let repo: MockRepo<PoHistory>;

  beforeEach(async () => {
    repo = createMockRepo<PoHistory>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PoHistoryService,
        { provide: getRepositoryToken(PoHistory), useValue: repo },
      ],
    }).compile();
    service = module.get(PoHistoryService);
  });

  describe('importFromExcel', () => {
    const buildSheet = (rows: any[][]): Buffer => {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'SPO');
      return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    };

    it('throws when SPO sheet is missing', async () => {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([['header']]);
      XLSX.utils.book_append_sheet(wb, ws, 'Other');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      await expect(service.importFromExcel(buf as Buffer)).rejects.toThrow(BadRequestException);
    });

    it('throws when sheet has only header (no data rows)', async () => {
      const buf = buildSheet([['PO#', 'DATE']]);
      await expect(service.importFromExcel(buf)).rejects.toThrow(/empty or has no data/);
    });

    it('skips empty rows (no PO number)', async () => {
      const buf = buildSheet([
        ['PO#', 'DATE', 'SUPPLIER'],
        ['', '', ''], // empty row
        ['PO-1', '2026-01-15', 'SUP A', 'IPN-1', 'MFR', 'MPN', 'desc', '10', 'SMT', 'REEL', 'CUST', '1.5', 'USD', 'note'],
      ]);
      (repo.save as jest.Mock).mockImplementation((arr) => Promise.resolve(arr));
      const out = await service.importFromExcel(buf);
      expect(out.imported).toBe(1);
    });

    it('parses numeric and date columns', async () => {
      const buf = buildSheet([
        ['PO#', 'DATE', 'SUPPLIER', 'AT&A#', 'MFR', 'MPN', 'Description', 'QTY', 'Mounting', 'Pkg', 'Customer', 'Unit Price', 'Currency', 'Comments'],
        ['PO-1', '2026-01-15', 'SUP A', 'IPN-1', 'MFR', 'MPN', 'desc', '10', 'SMT', 'REEL', 'CUST', '1.50', 'USD', 'note'],
      ]);
      const captured: any[] = [];
      (repo.create as jest.Mock).mockImplementation((e) => e);
      (repo.save as jest.Mock).mockImplementation((arr: any[]) => {
        captured.push(...arr);
        return Promise.resolve(arr);
      });
      const out = await service.importFromExcel(buf);
      expect(out.imported).toBe(1);
      expect(captured[0].quantity).toBe(10);
      expect(captured[0].unit_price).toBe(1.5);
      expect(captured[0].po_number).toBe('PO-1');
      expect(captured[0].order_date).toBeInstanceOf(Date);
    });

    it('preserves null for missing/blank values', async () => {
      const buf = buildSheet([
        ['PO#', 'DATE', 'SUPPLIER'],
        ['PO-2', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ]);
      (repo.create as jest.Mock).mockImplementation((e) => e);
      const captured: any[] = [];
      (repo.save as jest.Mock).mockImplementation((arr: any[]) => { captured.push(...arr); return Promise.resolve(arr); });
      await service.importFromExcel(buf);
      expect(captured[0].supplier).toBeNull();
      expect(captured[0].order_date).toBeNull();
      expect(captured[0].quantity).toBeNull();
    });

    it('chunks inserts into 500-row batches', async () => {
      const rows: any[][] = [['PO#', 'DATE', 'SUPPLIER']];
      for (let i = 0; i < 1100; i++) {
        rows.push([
          `PO-${i}`, '2026-01-01', 'SUP', 'IPN', 'MFR', 'MPN', 'desc', String(i), 'SMT', 'REEL', 'CUST', '0', 'USD', 'note',
        ]);
      }
      const buf = buildSheet(rows);
      (repo.create as jest.Mock).mockImplementation((e) => e);
      (repo.save as jest.Mock).mockImplementation((arr) => Promise.resolve(arr));
      const out = await service.importFromExcel(buf);
      expect(out.imported).toBe(1100);
      // 500 + 500 + 100 = 3 batches
      expect((repo.save as jest.Mock).mock.calls.length).toBe(3);
    });
  });

  describe('findAll', () => {
    it('returns full list ordered by date when no search', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);
      await service.findAll();
      expect(repo.find).toHaveBeenCalledWith({
        order: { order_date: 'DESC', po_number: 'ASC' },
        take: 1000,
        skip: 0,
      });
    });

    it('runs case-insensitive ILIKE-style search across columns', async () => {
      const qb = repo.createQueryBuilder();
      qb.getMany.mockResolvedValue([]);
      await service.findAll('SuP-A', 50, 10);
      expect(qb.where).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(ph.po_number) LIKE :q'),
        { q: '%sup-a%' },
      );
      expect(qb.take).toHaveBeenCalledWith(50);
      expect(qb.skip).toHaveBeenCalledWith(10);
    });
  });

  describe('count', () => {
    it('delegates to repository count()', async () => {
      (repo.count as jest.Mock).mockResolvedValue(42);
      expect(await service.count()).toBe(42);
    });
  });
});
