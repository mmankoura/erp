import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InventoryLot } from '../../entities/inventory-lot.entity';
import { Customer } from '../../entities/customer.entity';
import { OwnerType } from '../../entities/inventory-transaction.entity';
import { LotLabelData } from './dto/label-data.dto';

/**
 * The same relation set GET /inventory/lots/by-uid/:uid already loads. Between
 * them these three cover every label field except the owner name, which cannot
 * come along for the ride — see resolveOwnerNames.
 */
const LABEL_RELATIONS = ['material', 'material.customer', 'supplier'];

@Injectable()
export class LabelsService {
  constructor(
    @InjectRepository(InventoryLot)
    private readonly lotRepository: Repository<InventoryLot>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
  ) {}

  async getByLotId(id: string): Promise<LotLabelData> {
    const lot = await this.lotRepository.findOne({
      where: { id },
      relations: LABEL_RELATIONS,
    });
    if (!lot) {
      throw new NotFoundException(`Inventory lot ${id} not found`);
    }
    const [data] = await this.toLabelData([lot]);
    return data;
  }

  async getByUid(uid: string): Promise<LotLabelData> {
    const lot = await this.lotRepository.findOne({
      where: { uid },
      relations: LABEL_RELATIONS,
    });
    if (!lot) {
      throw new NotFoundException(`No inventory lot with UID ${uid}`);
    }
    const [data] = await this.toLabelData([lot]);
    return data;
  }

  /**
   * Batch fetch for printing a filtered set. Returns labels in the order the
   * caller asked for them, and silently drops ids that no longer exist — a lot
   * deleted between rendering the grid and hitting Print should not fail the
   * whole run.
   */
  async getManyByLotIds(ids: string[]): Promise<LotLabelData[]> {
    if (ids.length === 0) {
      return [];
    }

    const lots = await this.lotRepository.find({
      where: { id: In(ids) },
      relations: LABEL_RELATIONS,
    });

    const data = await this.toLabelData(lots);
    const byId = new Map(data.map((d) => [d.lot_id, d]));
    return ids
      .map((id) => byId.get(id))
      .filter((d): d is LotLabelData => d !== undefined);
  }

  /**
   * InventoryLot.owner_id has no ManyToOne — it is a bare uuid whose meaning
   * depends on owner_type — so the customer name needs its own lookup. Resolve
   * the whole batch in one query rather than per lot.
   */
  private async resolveOwnerNames(
    lots: InventoryLot[],
  ): Promise<Map<string, string>> {
    const ownerIds = [
      ...new Set(
        lots
          .filter((l) => l.owner_type === OwnerType.CUSTOMER && l.owner_id)
          .map((l) => l.owner_id as string),
      ),
    ];

    if (ownerIds.length === 0) {
      return new Map();
    }

    const customers = await this.customerRepository.find({
      where: { id: In(ownerIds) },
    });
    return new Map(customers.map((c) => [c.id, c.name]));
  }

  private async toLabelData(lots: InventoryLot[]): Promise<LotLabelData[]> {
    const ownerNames = await this.resolveOwnerNames(lots);

    return lots.map((lot) => ({
      lot_id: lot.id,
      uid: lot.uid,
      ipn: lot.material?.internal_part_number ?? '',
      description: lot.material?.description ?? null,
      manufacturer: lot.material?.manufacturer ?? null,
      manufacturer_pn: lot.material?.manufacturer_pn ?? null,
      resource_type: lot.material?.resource_type ?? null,
      // decimal columns come back from pg as strings; the label needs a number
      // so the client can format it without re-parsing.
      quantity: Number(lot.quantity),
      package_type: lot.package_type,
      po_reference: lot.po_reference,
      supplier_name: lot.supplier?.name ?? null,
      owner_type: lot.owner_type,
      owner_name:
        lot.owner_type === OwnerType.CUSTOMER && lot.owner_id
          ? (ownerNames.get(lot.owner_id) ?? null)
          : null,
      received_date: lot.received_date,
      bin: lot.bin,
    }));
  }
}
