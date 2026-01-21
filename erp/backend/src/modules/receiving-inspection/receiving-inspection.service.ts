import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  ReceivingInspection,
  InspectionStatus,
  InspectionResult,
  ValidationResults,
} from '../../entities/receiving-inspection.entity';
import { Material } from '../../entities/material.entity';
import { PurchaseOrderLine } from '../../entities/purchase-order-line.entity';
import { AmlService } from '../aml/aml.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../audit/audit.service';
import {
  AuditEventType,
  AuditEntityType,
} from '../../entities/audit-event.entity';
import {
  TransactionType,
  ReferenceType,
  InventoryTransaction,
} from '../../entities/inventory-transaction.entity';

@Injectable()
export class ReceivingInspectionService {
  private inspectionCounter = 0;

  constructor(
    @InjectRepository(ReceivingInspection)
    private readonly inspectionRepository: Repository<ReceivingInspection>,
    @InjectRepository(Material)
    private readonly materialRepository: Repository<Material>,
    @InjectRepository(PurchaseOrderLine)
    private readonly poLineRepository: Repository<PurchaseOrderLine>,
    private readonly amlService: AmlService,
    @Inject(forwardRef(() => InventoryService))
    private readonly inventoryService: InventoryService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(): Promise<ReceivingInspection[]> {
    return this.inspectionRepository.find({
      relations: ['po_line', 'po_line.purchase_order', 'material', 'matched_aml'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: string): Promise<ReceivingInspection> {
    const inspection = await this.inspectionRepository.findOne({
      where: { id },
      relations: [
        'po_line',
        'po_line.purchase_order',
        'po_line.purchase_order.supplier',
        'material',
        'matched_aml',
        'inventory_transaction',
      ],
    });
    if (!inspection) {
      throw new NotFoundException(`Inspection with ID "${id}" not found`);
    }
    return inspection;
  }

  async findPending(): Promise<ReceivingInspection[]> {
    return this.inspectionRepository.find({
      where: [
        { status: InspectionStatus.PENDING },
        { status: InspectionStatus.IN_PROGRESS },
        { status: InspectionStatus.ON_HOLD },
      ],
      relations: ['po_line', 'po_line.purchase_order', 'material'],
      order: { created_at: 'ASC' },
    });
  }

  async findByStatus(status: InspectionStatus): Promise<ReceivingInspection[]> {
    return this.inspectionRepository.find({
      where: { status },
      relations: ['po_line', 'po_line.purchase_order', 'material'],
      order: { created_at: 'DESC' },
    });
  }

  async findByPoLine(poLineId: string): Promise<ReceivingInspection[]> {
    return this.inspectionRepository.find({
      where: { po_line_id: poLineId },
      relations: ['po_line', 'material', 'matched_aml'],
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Create a new receiving inspection record.
   * Called by PurchaseOrdersService.receiveAgainstPO
   */
  async create(data: {
    po_line_id: string;
    material_id: string;
    received_ipn: string;
    received_manufacturer?: string;
    received_mpn?: string;
    quantity_received: number;
    unit_cost?: number;
    received_by?: string;
    notes?: string;
  }): Promise<ReceivingInspection> {
    const inspectionNumber = await this.generateInspectionNumber();

    const inspection = this.inspectionRepository.create({
      inspection_number: inspectionNumber,
      po_line_id: data.po_line_id,
      material_id: data.material_id,
      received_ipn: data.received_ipn,
      received_manufacturer: data.received_manufacturer ?? null,
      received_mpn: data.received_mpn ?? null,
      quantity_received: data.quantity_received,
      unit_cost: data.unit_cost ?? null,
      received_by: data.received_by ?? null,
      received_at: new Date(),
      status: InspectionStatus.PENDING,
      overall_result: InspectionResult.NOT_CHECKED,
      notes: data.notes ?? null,
    });

    const saved = await this.inspectionRepository.save(inspection);

    await this.auditService.emitCreate(
      AuditEventType.INSPECTION_CREATED,
      AuditEntityType.RECEIVING_INSPECTION,
      saved.id,
      {
        inspection_number: saved.inspection_number,
        po_line_id: saved.po_line_id,
        material_id: saved.material_id,
        received_ipn: saved.received_ipn,
        received_manufacturer: saved.received_manufacturer,
        received_mpn: saved.received_mpn,
        quantity_received: saved.quantity_received,
      },
      data.received_by,
    );

    return this.findOne(saved.id);
  }

  /**
   * Perform validation checks on a receiving inspection.
   * Validates IPN, MPN against AML, and documents quantity.
   */
  async performValidation(
    id: string,
    inspector: string,
  ): Promise<ReceivingInspection> {
    const inspection = await this.findOne(id);

    if (
      inspection.status !== InspectionStatus.PENDING &&
      inspection.status !== InspectionStatus.IN_PROGRESS &&
      inspection.status !== InspectionStatus.ON_HOLD
    ) {
      throw new BadRequestException(
        `Cannot validate inspection with status "${inspection.status}"`,
      );
    }

    // Update status to IN_PROGRESS
    inspection.status = InspectionStatus.IN_PROGRESS;
    inspection.inspected_by = inspector;
    inspection.inspected_at = new Date();

    // Get the material for IPN validation
    const material = await this.materialRepository.findOne({
      where: { id: inspection.material_id },
    });

    if (!material) {
      throw new NotFoundException(`Material not found`);
    }

    // Get the PO line for quantity validation
    const poLine = await this.poLineRepository.findOne({
      where: { id: inspection.po_line_id },
    });

    const now = new Date().toISOString();
    const validationResults: ValidationResults = {};

    // 1. IPN Validation
    const expectedIpn = material.internal_part_number;
    const receivedIpn = inspection.received_ipn;
    const ipnMatch = expectedIpn === receivedIpn;

    validationResults.ipn_validation = {
      result: ipnMatch ? InspectionResult.PASS : InspectionResult.FAIL,
      expected_ipn: expectedIpn,
      received_ipn: receivedIpn,
      checked_by: inspector,
      checked_at: now,
    };

    // 2. MPN Validation (against AML)
    let mpnValidation: ValidationResults['mpn_validation'];

    if (inspection.received_manufacturer && inspection.received_mpn) {
      const amlValidation = await this.amlService.validate(
        inspection.material_id,
        inspection.received_manufacturer,
        inspection.received_mpn,
      );

      mpnValidation = {
        result: amlValidation.is_valid
          ? InspectionResult.PASS
          : InspectionResult.FAIL,
        is_on_aml: amlValidation.aml_entry !== null,
        approved_manufacturer_id: amlValidation.aml_entry?.id,
        received_manufacturer: inspection.received_manufacturer,
        received_mpn: inspection.received_mpn,
        checked_by: inspector,
        checked_at: now,
      };

      // Store matched AML entry if found
      if (amlValidation.aml_entry) {
        inspection.matched_aml_id = amlValidation.aml_entry.id;
      }
    } else {
      // No manufacturer/MPN provided - cannot validate
      mpnValidation = {
        result: InspectionResult.NOT_CHECKED,
        is_on_aml: false,
        received_manufacturer: inspection.received_manufacturer ?? '',
        received_mpn: inspection.received_mpn ?? '',
        checked_by: inspector,
        checked_at: now,
      };
    }

    validationResults.mpn_validation = mpnValidation;

    // 3. Quantity Validation (documentation only)
    const expectedQuantity = poLine
      ? parseFloat(String(poLine.quantity_ordered)) -
        parseFloat(String(poLine.quantity_received))
      : 0;
    const receivedQuantity = parseFloat(String(inspection.quantity_received));
    const variancePercent =
      expectedQuantity !== 0
        ? ((receivedQuantity - expectedQuantity) / expectedQuantity) * 100
        : 0;

    validationResults.quantity_validation = {
      result: InspectionResult.PASS, // Always pass - just documentation
      expected_quantity: expectedQuantity,
      received_quantity: receivedQuantity,
      variance_percent: Math.round(variancePercent * 100) / 100,
      checked_by: inspector,
      checked_at: now,
    };

    inspection.validation_results = validationResults;

    // Determine overall result
    const ipnPassed =
      validationResults.ipn_validation.result === InspectionResult.PASS;
    const mpnPassed =
      validationResults.mpn_validation?.result === InspectionResult.PASS ||
      validationResults.mpn_validation?.result === InspectionResult.NOT_CHECKED;

    if (ipnPassed && mpnPassed) {
      inspection.overall_result = InspectionResult.PASS;
    } else if (
      validationResults.mpn_validation?.result === InspectionResult.NOT_CHECKED
    ) {
      inspection.overall_result = InspectionResult.CONDITIONAL;
    } else {
      inspection.overall_result = InspectionResult.FAIL;
    }

    const saved = await this.inspectionRepository.save(inspection);

    await this.auditService.emitStateChange(
      AuditEventType.INSPECTION_VALIDATED,
      AuditEntityType.RECEIVING_INSPECTION,
      id,
      { status: InspectionStatus.PENDING },
      {
        status: saved.status,
        overall_result: saved.overall_result,
        validation_results: saved.validation_results,
      },
      inspector,
    );

    return this.findOne(id);
  }

  /**
   * Approve an inspection after validation.
   */
  async approve(
    id: string,
    dispositionBy: string,
    notes?: string,
  ): Promise<ReceivingInspection> {
    const inspection = await this.findOne(id);

    if (inspection.status === InspectionStatus.APPROVED) {
      throw new BadRequestException(`Inspection is already approved`);
    }

    if (inspection.status === InspectionStatus.RELEASED) {
      throw new BadRequestException(
        `Inspection has already been released to inventory`,
      );
    }

    if (inspection.status === InspectionStatus.REJECTED) {
      throw new BadRequestException(
        `Cannot approve a rejected inspection. Create a new inspection for the re-received material.`,
      );
    }

    const oldStatus = inspection.status;
    inspection.status = InspectionStatus.APPROVED;
    inspection.disposition_by = dispositionBy;
    inspection.disposition_at = new Date();
    inspection.disposition_notes = notes ?? null;

    const saved = await this.inspectionRepository.save(inspection);

    await this.auditService.emitStateChange(
      AuditEventType.INSPECTION_APPROVED,
      AuditEntityType.RECEIVING_INSPECTION,
      id,
      { status: oldStatus },
      { status: InspectionStatus.APPROVED },
      dispositionBy,
      { disposition_notes: notes },
    );

    return this.findOne(id);
  }

  /**
   * Reject an inspection.
   */
  async reject(
    id: string,
    dispositionBy: string,
    notes?: string,
  ): Promise<ReceivingInspection> {
    const inspection = await this.findOne(id);

    if (inspection.status === InspectionStatus.REJECTED) {
      throw new BadRequestException(`Inspection is already rejected`);
    }

    if (inspection.status === InspectionStatus.RELEASED) {
      throw new BadRequestException(
        `Cannot reject an inspection that has been released to inventory`,
      );
    }

    const oldStatus = inspection.status;
    inspection.status = InspectionStatus.REJECTED;
    inspection.disposition_by = dispositionBy;
    inspection.disposition_at = new Date();
    inspection.disposition_notes = notes ?? null;

    const saved = await this.inspectionRepository.save(inspection);

    await this.auditService.emitStateChange(
      AuditEventType.INSPECTION_REJECTED,
      AuditEntityType.RECEIVING_INSPECTION,
      id,
      { status: oldStatus },
      { status: InspectionStatus.REJECTED },
      dispositionBy,
      { disposition_notes: notes },
    );

    return this.findOne(id);
  }

  /**
   * Put an inspection on hold for further review.
   */
  async hold(
    id: string,
    dispositionBy: string,
    notes?: string,
  ): Promise<ReceivingInspection> {
    const inspection = await this.findOne(id);

    if (inspection.status === InspectionStatus.RELEASED) {
      throw new BadRequestException(
        `Cannot put on hold an inspection that has been released`,
      );
    }

    if (inspection.status === InspectionStatus.REJECTED) {
      throw new BadRequestException(`Cannot put on hold a rejected inspection`);
    }

    const oldStatus = inspection.status;
    inspection.status = InspectionStatus.ON_HOLD;
    inspection.disposition_by = dispositionBy;
    inspection.disposition_at = new Date();
    inspection.disposition_notes = notes ?? null;

    const saved = await this.inspectionRepository.save(inspection);

    await this.auditService.emitStateChange(
      AuditEventType.INSPECTION_ON_HOLD,
      AuditEntityType.RECEIVING_INSPECTION,
      id,
      { status: oldStatus },
      { status: InspectionStatus.ON_HOLD },
      dispositionBy,
      { disposition_notes: notes },
    );

    return this.findOne(id);
  }

  /**
   * Release an approved inspection to inventory.
   * Creates an inventory transaction.
   */
  async releaseToInventory(
    id: string,
    actor: string,
  ): Promise<{ inspection: ReceivingInspection; transaction: InventoryTransaction }> {
    const inspection = await this.findOne(id);

    if (inspection.status !== InspectionStatus.APPROVED) {
      throw new BadRequestException(
        `Can only release APPROVED inspections. Current status: ${inspection.status}`,
      );
    }

    if (inspection.inventory_transaction_id) {
      throw new BadRequestException(
        `Inspection has already been released to inventory`,
      );
    }

    // Create inventory transaction
    const transaction = await this.inventoryService.createTransaction({
      material_id: inspection.material_id,
      transaction_type: TransactionType.RECEIPT,
      quantity: parseFloat(String(inspection.quantity_received)),
      reference_type: ReferenceType.PO_RECEIPT,
      reference_id: inspection.po_line_id,
      reason: `Released from inspection ${inspection.inspection_number}`,
      created_by: actor,
      unit_cost: inspection.unit_cost
        ? parseFloat(String(inspection.unit_cost))
        : undefined,
    });

    // Update inspection status and link to transaction
    const oldStatus = inspection.status;
    inspection.status = InspectionStatus.RELEASED;
    inspection.inventory_transaction_id = transaction.id;

    const saved = await this.inspectionRepository.save(inspection);

    await this.auditService.emitStateChange(
      AuditEventType.INSPECTION_RELEASED,
      AuditEntityType.RECEIVING_INSPECTION,
      id,
      { status: oldStatus },
      {
        status: InspectionStatus.RELEASED,
        inventory_transaction_id: transaction.id,
      },
      actor,
    );

    return {
      inspection: await this.findOne(id),
      transaction,
    };
  }

  /**
   * Bulk release all approved inspections for a list of IDs.
   */
  async bulkRelease(
    ids: string[],
    actor: string,
  ): Promise<{
    released: number;
    failed: number;
    results: Array<{
      id: string;
      success: boolean;
      error?: string;
    }>;
  }> {
    const results: Array<{ id: string; success: boolean; error?: string }> = [];
    let released = 0;
    let failed = 0;

    for (const id of ids) {
      try {
        await this.releaseToInventory(id, actor);
        results.push({ id, success: true });
        released++;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        results.push({ id, success: false, error: errorMessage });
        failed++;
      }
    }

    return { released, failed, results };
  }

  /**
   * Generate a unique inspection number.
   */
  private async generateInspectionNumber(): Promise<string> {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    // Find the highest inspection number for today
    const todayPrefix = `INS-${year}${month}${day}`;
    const latest = await this.inspectionRepository
      .createQueryBuilder('i')
      .where('i.inspection_number LIKE :prefix', { prefix: `${todayPrefix}%` })
      .orderBy('i.inspection_number', 'DESC')
      .getOne();

    let sequence = 1;
    if (latest) {
      const lastSequence = parseInt(
        latest.inspection_number.split('-').pop() ?? '0',
        10,
      );
      sequence = lastSequence + 1;
    }

    return `${todayPrefix}-${String(sequence).padStart(4, '0')}`;
  }
}
