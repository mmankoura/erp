import { ArrayNotEmpty, ArrayMaxSize, IsArray, IsUUID } from 'class-validator';
import { OwnerType } from '../../../entities/inventory-transaction.entity';
import { PackageType } from '../../../entities/inventory-lot.entity';
import { ResourceType } from '../../../entities/bom-item.entity';

/**
 * Everything a printed lot label can carry, assembled server-side so that all
 * four print triggers (auto-print on receipt, receipt-log reprint, reprint by
 * UID, batch print) share one shape and one set of null rules.
 *
 * This module deliberately returns DATA ONLY — it renders nothing. The label
 * itself is drawn client-side by the DYMO framework, which owns the template
 * geometry and the barcode symbology.
 */
export interface LotLabelData {
  lot_id: string;

  /**
   * The barcode payload and the human-readable line under it.
   *
   * Today this is whatever the operator typed at receiving — `uid` is an
   * operator-supplied field on QuickReceiveDto and nothing mints it on the live
   * path. We read it off the saved lot rather than off any form, so when
   * UidGeneratorService is eventually wired into quickReceive, nothing here
   * changes.
   */
  uid: string;

  ipn: string;
  description: string | null;

  /**
   * Catalog manufacturer/MPN off Material — a proxy for what physically
   * arrived, not a record of it. QuickReceiveDto accepts received_mpn and
   * received_manufacturer in STOCK mode and then discards them, so there is no
   * as-received value to print.
   */
  manufacturer: string | null;
  manufacturer_pn: string | null;

  /**
   * Drives the template's "Mounting Type" line (SMT / TH / MECH / PCB / DNP).
   * Nullable on Material, and plenty of catalogue rows leave it unset.
   */
  resource_type: ResourceType | null;

  quantity: number;
  package_type: PackageType;

  po_reference: string | null;

  /**
   * Null for Customer-Supplied and Stock receipts: the lot only gets a
   * supplier_id when a purchase order actually resolved at receiving time.
   * Callers should omit the line, not treat it as an error.
   */
  supplier_name: string | null;

  owner_type: OwnerType;

  /** Only ever set when owner_type is CUSTOMER. */
  owner_name: string | null;

  received_date: Date | null;

  /** Null at receipt — assigned later on the Inventory page. */
  bin: string | null;
}

/** Guards against someone printing the entire lot table by accident. */
export const MAX_LABEL_BATCH = 200;

export class BatchLabelDataDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_LABEL_BATCH)
  @IsUUID(undefined, { each: true })
  lot_ids: string[];
}
