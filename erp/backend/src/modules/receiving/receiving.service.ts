import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  ReceivingSession,
  ReceivingSessionStatus,
  ReceiptType,
} from '../../entities/receiving-session.entity';
import {
  ReceivingSessionLine,
  ReceivingLineValidationStatus,
  HoldReasonCode,
  DispositionAction,
} from '../../entities/receiving-session-line.entity';
import {
  InventoryLot,
  LotStatus,
  PackageType,
} from '../../entities/inventory-lot.entity';
import {
  ReceivingInspection,
  InspectionStatus,
  InspectionResult,
} from '../../entities/receiving-inspection.entity';
import {
  InventoryTransaction,
  TransactionType,
  ReferenceType,
  InventoryBucket,
  OwnerType,
} from '../../entities/inventory-transaction.entity';
import { Material } from '../../entities/material.entity';
import { PurchaseOrder } from '../../entities/purchase-order.entity';
import { PurchaseOrderLine } from '../../entities/purchase-order-line.entity';
import { StartSessionDto } from './dto/start-session.dto';
import { ReceiveItemDto } from './dto/receive-item.dto';
import { ResolveDiscrepancyDto } from './dto/resolve-discrepancy.dto';
import { UidGeneratorService } from './uid-generator.service';
import { AmlService } from '../aml/aml.service';
import { AuditService } from '../audit/audit.service';
import {
  AuditEventType,
  AuditEntityType,
} from '../../entities/audit-event.entity';

@Injectable()
export class ReceivingService {
  private readonly logger = new Logger(ReceivingService.name);

  constructor(
    @InjectRepository(ReceivingSession)
    private readonly sessionRepository: Repository<ReceivingSession>,
    @InjectRepository(ReceivingSessionLine)
    private readonly lineRepository: Repository<ReceivingSessionLine>,
    @InjectRepository(InventoryLot)
    private readonly lotRepository: Repository<InventoryLot>,
    @InjectRepository(ReceivingInspection)
    private readonly inspectionRepository: Repository<ReceivingInspection>,
    @InjectRepository(InventoryTransaction)
    private readonly transactionRepository: Repository<InventoryTransaction>,
    @InjectRepository(Material)
    private readonly materialRepository: Repository<Material>,
    @InjectRepository(PurchaseOrder)
    private readonly poRepository: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderLine)
    private readonly poLineRepository: Repository<PurchaseOrderLine>,
    private readonly dataSource: DataSource,
    private readonly uidGenerator: UidGeneratorService,
    private readonly amlService: AmlService,
    private readonly auditService: AuditService,
  ) {}

  // ==================== SESSION MANAGEMENT ====================

  async startSession(dto: StartSessionDto): Promise<ReceivingSession> {
    const sessionNumber = await this.generateSessionNumber();

    // Validate PO if PO mode
    let supplierId = dto.supplier_id ?? null;
    if (dto.receipt_type === ReceiptType.PO && dto.po_id) {
      const po = await this.poRepository.findOne({
        where: { id: dto.po_id },
        relations: ['supplier'],
      });
      if (!po) {
        throw new NotFoundException(`PO with ID "${dto.po_id}" not found`);
      }
      supplierId = po.supplier_id;
    }

    const session = this.sessionRepository.create({
      session_number: sessionNumber,
      receipt_type: dto.receipt_type,
      po_id: dto.po_id ?? null,
      packing_slip_number: dto.packing_slip_number ?? null,
      customer_id: dto.customer_id ?? null,
      supplier_id: supplierId,
      auto_release_on_pass: dto.auto_release_on_pass ?? true,
      status: ReceivingSessionStatus.OPEN,
      started_by: dto.started_by,
      notes: dto.notes ?? null,
    });

    const saved = await this.sessionRepository.save(session);
    return this.findSession(saved.id);
  }

  async findAllSessions(status?: ReceivingSessionStatus): Promise<ReceivingSession[]> {
    const where: any = {};
    if (status) where.status = status;

    return this.sessionRepository.find({
      where,
      relations: ['purchase_order', 'customer', 'supplier'],
      order: { created_at: 'DESC' },
    });
  }

  async findSession(id: string): Promise<ReceivingSession> {
    const session = await this.sessionRepository.findOne({
      where: { id },
      relations: ['purchase_order', 'customer', 'supplier'],
    });
    if (!session) {
      throw new NotFoundException(`Receiving session "${id}" not found`);
    }
    return session;
  }

  async getSessionWithLines(id: string): Promise<{
    session: ReceivingSession;
    lines: ReceivingSessionLine[];
  }> {
    const session = await this.findSession(id);
    const lines = await this.lineRepository.find({
      where: { session_id: id },
      relations: ['material', 'po_line', 'lot'],
      order: { line_number: 'ASC' },
    });
    return { session, lines };
  }

  async closeSession(id: string): Promise<ReceivingSession> {
    const session = await this.findSession(id);
    if (session.status !== ReceivingSessionStatus.OPEN) {
      throw new BadRequestException(
        `Cannot close session with status "${session.status}"`,
      );
    }
    session.status = ReceivingSessionStatus.CLOSED;
    session.closed_at = new Date();
    return this.sessionRepository.save(session);
  }

  async cancelSession(id: string): Promise<ReceivingSession> {
    const session = await this.findSession(id);
    if (session.status !== ReceivingSessionStatus.OPEN) {
      throw new BadRequestException(
        `Cannot cancel session with status "${session.status}"`,
      );
    }
    session.status = ReceivingSessionStatus.CANCELLED;
    session.closed_at = new Date();
    return this.sessionRepository.save(session);
  }

  // ==================== CORE RECEIVE FLOW ====================

  async receiveItem(
    sessionId: string,
    dto: ReceiveItemDto,
  ): Promise<{
    status: 'PASS' | 'FLAGGED';
    line: ReceivingSessionLine;
    uid: string;
    validation_details: Record<string, any>;
    hold_reason_code?: HoldReasonCode;
    auto_released: boolean;
  }> {
    const session = await this.findSession(sessionId);
    if (session.status !== ReceivingSessionStatus.OPEN) {
      throw new BadRequestException('Session is not open');
    }

    // Step 0: Idempotency check
    const existing = await this.lineRepository.findOne({
      where: {
        session_id: sessionId,
        client_request_id: dto.client_request_id,
      },
      relations: ['material', 'lot'],
    });
    if (existing) {
      return {
        status:
          existing.validation_status === ReceivingLineValidationStatus.PASS
            ? 'PASS'
            : 'FLAGGED',
        line: existing,
        uid: existing.uid,
        validation_details: existing.validation_details || {},
        hold_reason_code: existing.hold_reason_code ?? undefined,
        auto_released: false, // can't know after the fact, but idempotent return is safe
      };
    }

    // Step 1: Validate IPN
    const material = await this.materialRepository.findOne({
      where: { internal_part_number: dto.received_ipn },
    });
    if (!material) {
      throw new BadRequestException(
        `Material with IPN "${dto.received_ipn}" not found`,
      );
    }

    const isPOMode = session.receipt_type === ReceiptType.PO;

    // PO mode: MPN is required
    if (isPOMode && !dto.received_mpn) {
      throw new BadRequestException(
        'MPN is required in PO receiving mode',
      );
    }

    const validationDetails: Record<string, any> = {};
    const flags: HoldReasonCode[] = [];
    let ipnMatch = true;
    let amlMatch: boolean | null = null;
    let matchedAmlId: string | null = null;
    let matchedPoLine: PurchaseOrderLine | null = null;
    let qtyExpected: number | null = null;
    let qtyRemainingOnPo: number | null = null;

    // Step 2: Match PO line (PO mode only)
    if (isPOMode && session.po_id) {
      const poLines = await this.poLineRepository.find({
        where: {
          purchase_order_id: session.po_id,
          material_id: material.id,
        },
        order: { line_number: 'ASC' },
      });

      // Find line with remaining qty
      const candidates = poLines.filter(
        (l) =>
          parseFloat(String(l.quantity_ordered)) -
            parseFloat(String(l.quantity_received)) >
          0,
      );

      if (candidates.length > 0) {
        // Pick earliest line (already ordered by line_number ASC)
        matchedPoLine = candidates[0];
        qtyExpected = parseFloat(String(matchedPoLine.quantity_ordered));
        qtyRemainingOnPo =
          parseFloat(String(matchedPoLine.quantity_ordered)) -
          parseFloat(String(matchedPoLine.quantity_received));
        validationDetails.po_line_matched = true;
        validationDetails.selected_by_rule = 'lowest_line_number';
      } else {
        flags.push(HoldReasonCode.NO_PO_LINE);
        validationDetails.po_line_matched = false;
      }

      // Qty check (informational only)
      if (qtyRemainingOnPo !== null) {
        if (dto.quantity_received > qtyRemainingOnPo) {
          validationDetails.qty_warning = 'OVER';
        } else if (dto.quantity_received < qtyRemainingOnPo) {
          validationDetails.qty_warning = 'UNDER';
        }
        validationDetails.qty_expected = qtyExpected;
        validationDetails.qty_remaining = qtyRemainingOnPo;
      }
    }

    // Step 3: Validate MPN against AML
    if (dto.received_mpn) {
      const amlMatches = await this.amlService.findApprovedByMaterialAndMpn(
        material.id,
        dto.received_mpn,
        session.customer_id,
      );

      if (amlMatches.length === 0) {
        flags.push(HoldReasonCode.NO_AML);
        amlMatch = false;
        validationDetails.aml_match = false;
        validationDetails.aml_message = 'No approved AML entry found for this MPN';
      } else if (amlMatches.length === 1) {
        amlMatch = true;
        matchedAmlId = amlMatches[0].id;
        // Auto-fill manufacturer from AML match
        dto.received_manufacturer = amlMatches[0].manufacturer;
        validationDetails.aml_match = true;
        validationDetails.aml_manufacturer = amlMatches[0].manufacturer;
      } else {
        // Multiple matches — need manufacturer selection
        if (!dto.received_manufacturer) {
          // Return 422 with choices — caller must provide received_manufacturer
          const manufacturers = amlMatches.map((a) => ({
            id: a.id,
            manufacturer: a.manufacturer,
          }));
          throw new BadRequestException({
            statusCode: 422,
            message: 'Multiple AML matches found. Please select a manufacturer.',
            manufacturers,
          });
        }
        // Find the specific match
        const selectedAml = amlMatches.find(
          (a) => a.manufacturer === dto.received_manufacturer,
        );
        if (selectedAml) {
          amlMatch = true;
          matchedAmlId = selectedAml.id;
          validationDetails.aml_match = true;
          validationDetails.aml_manufacturer = selectedAml.manufacturer;
        } else {
          flags.push(HoldReasonCode.NO_AML);
          amlMatch = false;
          validationDetails.aml_match = false;
        }
      }
    }

    // Check operator flag
    const operatorFlagged = dto.operator_flagged === true;
    if (operatorFlagged) {
      if (!dto.operator_flag_reason) {
        throw new BadRequestException(
          'operator_flag_reason is required when operator_flagged is true',
        );
      }
    }

    const isFlagged = flags.length > 0 || operatorFlagged;

    // Determine hold reason
    let holdReasonCode: HoldReasonCode | null = null;
    let holdNotes: string | null = null;
    if (operatorFlagged) {
      holdReasonCode = HoldReasonCode.OTHER;
      holdNotes = dto.operator_flag_reason!;
    } else if (flags.length > 0) {
      // Priority: NO_AML > WRONG_MPN > NO_PO_LINE
      const priority = [
        HoldReasonCode.NO_AML,
        HoldReasonCode.WRONG_MPN,
        HoldReasonCode.NO_PO_LINE,
      ];
      holdReasonCode =
        priority.find((f) => flags.includes(f)) ?? flags[0];
    }

    // Determine ownership
    const isCustomerSupplied =
      session.receipt_type === ReceiptType.CUSTOMER_SUPPLIED;
    const ownerType = isCustomerSupplied
      ? OwnerType.CUSTOMER
      : OwnerType.COMPANY;
    const ownerId = isCustomerSupplied ? session.customer_id : null;

    // Steps 5-11: Execute in a single transaction
    let savedLine: ReceivingSessionLine;
    let autoReleased = false;

    await this.dataSource.transaction(async (manager) => {
      // Step 5: Reserve UID
      const uid = await this.uidGenerator.generate(manager);

      // Step 6: Allocate next line_number (atomic)
      const lineResult = await manager.query(
        `UPDATE "receiving_sessions"
         SET "next_line_number" = "next_line_number" + 1, "updated_at" = NOW()
         WHERE "id" = $1
         RETURNING "next_line_number"`,
        [sessionId],
      );
      const lineNumber = lineResult[0].next_line_number;

      // Step 7: Create ReceivingSessionLine
      const line = manager.create(ReceivingSessionLine, {
        session_id: sessionId,
        line_number: lineNumber,
        client_request_id: dto.client_request_id,
        material_id: material.id,
        received_ipn: dto.received_ipn,
        received_mpn: dto.received_mpn ?? null,
        received_manufacturer: dto.received_manufacturer ?? null,
        quantity_received: dto.quantity_received,
        package_type: dto.package_type ?? PackageType.TR,
        po_line_id: matchedPoLine?.id ?? null,
        uid,
        validation_status: ReceivingLineValidationStatus.PENDING,
        ipn_match: ipnMatch,
        aml_match: amlMatch,
        matched_aml_id: matchedAmlId,
        qty_expected: qtyExpected,
        qty_remaining_on_po: qtyRemainingOnPo,
        validation_details: validationDetails,
      });
      savedLine = await manager.save(ReceivingSessionLine, line);

      // Step 8: Create InventoryLot (ON_HOLD, quarantine first)
      const lot = manager.create(InventoryLot, {
        uid,
        material_id: material.id,
        quantity: dto.quantity_received,
        initial_quantity: dto.quantity_received,
        package_type: dto.package_type ?? PackageType.TR,
        po_reference: session.purchase_order?.po_number ?? null,
        supplier_id: session.supplier_id,
        received_date: new Date(),
        status: LotStatus.ON_HOLD,
        location: 'RECEIVING',
        owner_type: ownerType,
        owner_id: ownerId,
        receiving_session_line_id: savedLine.id,
      });
      const savedLot = await manager.save(InventoryLot, lot);

      // Step 9: Create ReceivingInspection (only if PO mode with po_line)
      let savedInspection: ReceivingInspection | null = null;
      if (matchedPoLine) {
        const inspectionNumber = await this.generateInspectionNumber(manager);
        const inspection = manager.create(ReceivingInspection, {
          inspection_number: inspectionNumber,
          po_line_id: matchedPoLine.id,
          material_id: material.id,
          received_ipn: dto.received_ipn,
          received_manufacturer: dto.received_manufacturer ?? null,
          received_mpn: dto.received_mpn ?? null,
          quantity_received: dto.quantity_received,
          matched_aml_id: matchedAmlId,
          unit_cost: matchedPoLine.unit_cost,
          received_by: session.started_by,
          received_at: new Date(),
          status: isFlagged
            ? InspectionStatus.ON_HOLD
            : InspectionStatus.APPROVED,
          overall_result: isFlagged
            ? InspectionResult.FAIL
            : InspectionResult.PASS,
          validation_results: {
            ipn_validation: {
              result: ipnMatch
                ? InspectionResult.PASS
                : InspectionResult.FAIL,
              expected_ipn: material.internal_part_number,
              received_ipn: dto.received_ipn,
            },
            mpn_validation: dto.received_mpn
              ? {
                  result: amlMatch
                    ? InspectionResult.PASS
                    : InspectionResult.FAIL,
                  is_on_aml: amlMatch ?? false,
                  approved_manufacturer_id: matchedAmlId || undefined,
                  received_manufacturer: dto.received_manufacturer ?? '',
                  received_mpn: dto.received_mpn,
                }
              : undefined,
            quantity_validation: qtyRemainingOnPo !== null
              ? {
                  result: InspectionResult.PASS,
                  expected_quantity: qtyRemainingOnPo,
                  received_quantity: dto.quantity_received,
                  variance_percent:
                    qtyRemainingOnPo > 0
                      ? ((dto.quantity_received - qtyRemainingOnPo) /
                          qtyRemainingOnPo) *
                        100
                      : 0,
                }
              : undefined,
          },
        });
        savedInspection = await manager.save(
          ReceivingInspection,
          inspection,
        );
      }

      // Update line with lot and inspection references
      savedLine.lot_id = savedLot.id;
      savedLine.inspection_id = savedInspection?.id ?? null;

      if (!isFlagged) {
        // Step 10: PASS path
        savedLine.validation_status = ReceivingLineValidationStatus.PASS;

        if (session.auto_release_on_pass) {
          // Auto-release: create inventory transaction, flip lot
          const transaction = manager.create(InventoryTransaction, {
            material_id: material.id,
            transaction_type: TransactionType.RECEIPT,
            quantity: Math.abs(dto.quantity_received),
            reference_type: ReferenceType.PO_RECEIPT,
            reference_id: matchedPoLine?.id ?? null,
            reason: `Received via session ${session.session_number}`,
            created_by: session.started_by,
            bucket: InventoryBucket.RAW,
            lot_id: savedLot.id,
            unit_cost: matchedPoLine?.unit_cost
              ? parseFloat(String(matchedPoLine.unit_cost))
              : null,
            owner_type: ownerType,
            owner_id: ownerId,
          });
          const savedTx = await manager.save(
            InventoryTransaction,
            transaction,
          );

          // Flip lot to ACTIVE
          savedLot.status = LotStatus.ACTIVE;
          savedLot.location = 'STOCK';
          await manager.save(InventoryLot, savedLot);

          // Update PO line qty_received
          if (matchedPoLine && isPOMode) {
            await manager.query(
              `UPDATE "purchase_order_lines"
               SET "quantity_received" = "quantity_received" + $1, "updated_at" = NOW()
               WHERE "id" = $2`,
              [dto.quantity_received, matchedPoLine.id],
            );

            // Check if PO is fully received
            await this.updatePOStatusIfFullyReceived(
              session.po_id!,
              manager,
            );
          }

          // Update inspection to RELEASED
          if (savedInspection) {
            savedInspection.status = InspectionStatus.RELEASED;
            savedInspection.inventory_transaction_id = savedTx.id;
            savedInspection.disposition_by = session.started_by;
            savedInspection.disposition_at = new Date();
            await manager.save(ReceivingInspection, savedInspection);
          }

          autoReleased = true;
        }
      } else {
        // Step 11: FLAGGED path
        savedLine.validation_status =
          ReceivingLineValidationStatus.FLAGGED;
        savedLine.hold_reason_code = holdReasonCode;
        savedLine.hold_notes = holdNotes;
      }

      await manager.save(ReceivingSessionLine, savedLine);
    });

    // Reload line with relations
    const fullLine = await this.lineRepository.findOne({
      where: { id: savedLine!.id },
      relations: ['material', 'lot'],
    });

    return {
      status: isFlagged ? 'FLAGGED' : 'PASS',
      line: fullLine!,
      uid: fullLine!.uid,
      validation_details: validationDetails,
      hold_reason_code: holdReasonCode ?? undefined,
      auto_released: autoReleased,
    };
  }

  // ==================== DISCREPANCY RESOLUTION ====================

  async resolveDiscrepancy(
    lineId: string,
    dto: ResolveDiscrepancyDto,
  ): Promise<ReceivingSessionLine> {
    const line = await this.lineRepository.findOne({
      where: { id: lineId },
      relations: ['session', 'lot', 'inspection', 'material'],
    });
    if (!line) {
      throw new NotFoundException(`Session line "${lineId}" not found`);
    }
    if (line.validation_status !== ReceivingLineValidationStatus.FLAGGED) {
      throw new BadRequestException(
        `Line is not flagged (status: ${line.validation_status})`,
      );
    }

    const session = line.session;
    const isPOMode = session.receipt_type === ReceiptType.PO;
    const isCustomerSupplied =
      session.receipt_type === ReceiptType.CUSTOMER_SUPPLIED;
    const ownerType = isCustomerSupplied
      ? OwnerType.CUSTOMER
      : OwnerType.COMPANY;
    const ownerId = isCustomerSupplied ? session.customer_id : null;

    await this.dataSource.transaction(async (manager) => {
      const lot = await manager.findOne(InventoryLot, {
        where: { id: line.lot_id! },
      });
      if (!lot) throw new NotFoundException('Lot not found');

      switch (dto.disposition_action) {
        case DispositionAction.ACCEPT_DEVIATION: {
          // Release lot as-is
          lot.status = LotStatus.ACTIVE;
          lot.location = 'STOCK';
          await manager.save(InventoryLot, lot);

          // Create inventory transaction
          const tx = manager.create(InventoryTransaction, {
            material_id: line.material_id,
            transaction_type: TransactionType.RECEIPT,
            quantity: Math.abs(
              parseFloat(String(line.quantity_received)),
            ),
            reference_type: ReferenceType.PO_RECEIPT,
            reference_id: line.po_line_id,
            reason: `Accepted with deviation - session ${session.session_number}`,
            created_by: dto.disposition_by,
            bucket: InventoryBucket.RAW,
            lot_id: lot.id,
            owner_type: ownerType,
            owner_id: ownerId,
          });
          const savedTx = await manager.save(InventoryTransaction, tx);

          // Update PO line qty_received
          if (line.po_line_id && isPOMode) {
            await manager.query(
              `UPDATE "purchase_order_lines"
               SET "quantity_received" = "quantity_received" + $1, "updated_at" = NOW()
               WHERE "id" = $2`,
              [line.quantity_received, line.po_line_id],
            );
            if (session.po_id) {
              await this.updatePOStatusIfFullyReceived(
                session.po_id,
                manager,
              );
            }
          }

          // Update inspection
          if (line.inspection_id) {
            await manager.update(ReceivingInspection, line.inspection_id, {
              status: InspectionStatus.RELEASED,
              inventory_transaction_id: savedTx.id,
              disposition_by: dto.disposition_by,
              disposition_at: new Date(),
              disposition_notes: dto.disposition_notes,
            });
          }

          line.validation_status = ReceivingLineValidationStatus.PASS;
          break;
        }

        case DispositionAction.PARTIAL_ACCEPT: {
          if (!dto.accepted_quantity) {
            throw new BadRequestException(
              'accepted_quantity is required for PARTIAL_ACCEPT',
            );
          }

          // Adjust lot quantity
          lot.quantity = dto.accepted_quantity;
          lot.status = LotStatus.ACTIVE;
          lot.location = 'STOCK';
          await manager.save(InventoryLot, lot);

          // Create transaction for accepted qty
          const tx = manager.create(InventoryTransaction, {
            material_id: line.material_id,
            transaction_type: TransactionType.RECEIPT,
            quantity: Math.abs(dto.accepted_quantity),
            reference_type: ReferenceType.PO_RECEIPT,
            reference_id: line.po_line_id,
            reason: `Partial accept (${dto.accepted_quantity} of ${line.quantity_received}) - session ${session.session_number}`,
            created_by: dto.disposition_by,
            bucket: InventoryBucket.RAW,
            lot_id: lot.id,
            owner_type: ownerType,
            owner_id: ownerId,
          });
          const savedTx = await manager.save(InventoryTransaction, tx);

          // Update PO line with accepted qty
          if (line.po_line_id && isPOMode) {
            await manager.query(
              `UPDATE "purchase_order_lines"
               SET "quantity_received" = "quantity_received" + $1, "updated_at" = NOW()
               WHERE "id" = $2`,
              [dto.accepted_quantity, line.po_line_id],
            );
            if (session.po_id) {
              await this.updatePOStatusIfFullyReceived(
                session.po_id,
                manager,
              );
            }
          }

          // Update inspection
          if (line.inspection_id) {
            await manager.update(ReceivingInspection, line.inspection_id, {
              status: InspectionStatus.RELEASED,
              inventory_transaction_id: savedTx.id,
              disposition_by: dto.disposition_by,
              disposition_at: new Date(),
              disposition_notes:
                dto.disposition_notes ??
                `Partial accept: ${dto.accepted_quantity} of ${line.quantity_received}`,
            });
          }

          line.validation_status = ReceivingLineValidationStatus.PASS;
          break;
        }

        case DispositionAction.REJECT_RTV: {
          lot.status = LotStatus.RTV;
          lot.disposition = 'Return to vendor';
          await manager.save(InventoryLot, lot);

          // No inventory transaction — material never entered usable stock

          // Update inspection
          if (line.inspection_id) {
            await manager.update(ReceivingInspection, line.inspection_id, {
              status: InspectionStatus.REJECTED,
              disposition_by: dto.disposition_by,
              disposition_at: new Date(),
              disposition_notes: dto.disposition_notes ?? 'Rejected - Return to vendor',
            });
          }

          line.validation_status = ReceivingLineValidationStatus.FAIL;
          break;
        }

        case DispositionAction.SCRAP: {
          lot.status = LotStatus.SCRAPPED;
          lot.disposition = 'Scrapped at receiving';
          await manager.save(InventoryLot, lot);

          // No inventory transaction — lot status is the audit record

          // Update inspection
          if (line.inspection_id) {
            await manager.update(ReceivingInspection, line.inspection_id, {
              status: InspectionStatus.REJECTED,
              disposition_by: dto.disposition_by,
              disposition_at: new Date(),
              disposition_notes: dto.disposition_notes ?? 'Scrapped at receiving',
            });
          }

          line.validation_status = ReceivingLineValidationStatus.FAIL;
          break;
        }
      }

      // Update line disposition fields
      line.disposition_action = dto.disposition_action;
      line.disposition_by = dto.disposition_by;
      line.disposition_at = new Date();
      line.disposition_notes = dto.disposition_notes ?? null;
      await manager.save(ReceivingSessionLine, line);
    });

    return this.lineRepository.findOne({
      where: { id: lineId },
      relations: ['material', 'lot', 'inspection'],
    }) as Promise<ReceivingSessionLine>;
  }

  // ==================== MANUAL RELEASE ====================

  async releaseLine(lineId: string, releasedBy?: string): Promise<ReceivingSessionLine> {
    const line = await this.lineRepository.findOne({
      where: { id: lineId },
      relations: ['session', 'lot', 'inspection', 'material'],
    });
    if (!line) {
      throw new NotFoundException(`Session line "${lineId}" not found`);
    }
    if (line.validation_status !== ReceivingLineValidationStatus.PASS) {
      throw new BadRequestException(
        `Line must have validation_status PASS to release (current: ${line.validation_status})`,
      );
    }
    if (!line.lot) {
      throw new BadRequestException('Line has no associated lot');
    }
    if (line.lot.status !== LotStatus.ON_HOLD) {
      throw new BadRequestException(
        `Lot is not ON_HOLD (current: ${line.lot.status})`,
      );
    }

    const session = line.session;
    const isCustomerSupplied =
      session.receipt_type === ReceiptType.CUSTOMER_SUPPLIED;
    const ownerType = isCustomerSupplied
      ? OwnerType.CUSTOMER
      : OwnerType.COMPANY;
    const ownerId = isCustomerSupplied ? session.customer_id : null;

    await this.dataSource.transaction(async (manager) => {
      // Create inventory transaction
      const tx = manager.create(InventoryTransaction, {
        material_id: line.material_id,
        transaction_type: TransactionType.RECEIPT,
        quantity: Math.abs(parseFloat(String(line.quantity_received))),
        reference_type: ReferenceType.PO_RECEIPT,
        reference_id: line.po_line_id,
        reason: `Manual release - session ${session.session_number}`,
        created_by: releasedBy ?? session.started_by,
        bucket: InventoryBucket.RAW,
        lot_id: line.lot_id,
        owner_type: ownerType,
        owner_id: ownerId,
      });
      const savedTx = await manager.save(InventoryTransaction, tx);

      // Flip lot
      await manager.update(InventoryLot, line.lot_id!, {
        status: LotStatus.ACTIVE,
        location: 'STOCK',
      });

      // Update PO line qty_received
      if (
        line.po_line_id &&
        session.receipt_type === ReceiptType.PO
      ) {
        await manager.query(
          `UPDATE "purchase_order_lines"
           SET "quantity_received" = "quantity_received" + $1, "updated_at" = NOW()
           WHERE "id" = $2`,
          [line.quantity_received, line.po_line_id],
        );
        if (session.po_id) {
          await this.updatePOStatusIfFullyReceived(
            session.po_id,
            manager,
          );
        }
      }

      // Update inspection
      if (line.inspection_id) {
        await manager.update(ReceivingInspection, line.inspection_id, {
          status: InspectionStatus.RELEASED,
          inventory_transaction_id: savedTx.id,
          disposition_by: releasedBy ?? session.started_by,
          disposition_at: new Date(),
        });
      }
    });

    return this.lineRepository.findOne({
      where: { id: lineId },
      relations: ['material', 'lot', 'inspection'],
    }) as Promise<ReceivingSessionLine>;
  }

  // ==================== LOOKUP ENDPOINTS ====================

  async lookupPO(poNumber: string): Promise<any> {
    const po = await this.poRepository.findOne({
      where: { po_number: poNumber },
      relations: ['supplier', 'lines', 'lines.material'],
    });
    if (!po) {
      throw new NotFoundException(`PO "${poNumber}" not found`);
    }
    return po;
  }

  async lookupMaterial(ipn: string): Promise<Material | null> {
    return this.materialRepository.findOne({
      where: { internal_part_number: ipn },
    });
  }

  async lookupAmlSuggestions(
    materialId: string,
    mpn: string,
    customerId?: string,
  ) {
    return this.amlService.findApprovedByMaterialAndMpn(
      materialId,
      mpn,
      customerId,
    );
  }

  async findFlaggedLines(): Promise<ReceivingSessionLine[]> {
    return this.lineRepository.find({
      where: {
        validation_status: ReceivingLineValidationStatus.FLAGGED,
      },
      relations: ['session', 'material', 'lot'],
      order: { created_at: 'DESC' },
    });
  }

  // ==================== HELPERS ====================

  private async generateSessionNumber(): Promise<string> {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const prefix = `RCV-${year}${month}${day}`;

    const latest = await this.sessionRepository
      .createQueryBuilder('s')
      .where('s.session_number LIKE :prefix', {
        prefix: `${prefix}%`,
      })
      .orderBy('s.session_number', 'DESC')
      .getOne();

    let seq = 1;
    if (latest) {
      const lastSeq = parseInt(
        latest.session_number.split('-').pop() ?? '0',
        10,
      );
      seq = lastSeq + 1;
    }

    return `${prefix}-${seq.toString().padStart(4, '0')}`;
  }

  private async generateInspectionNumber(
    manager: any,
  ): Promise<string> {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const prefix = `INS-${year}${month}${day}`;

    const latest = await manager
      .createQueryBuilder(ReceivingInspection, 'i')
      .where('i.inspection_number LIKE :prefix', {
        prefix: `${prefix}%`,
      })
      .orderBy('i.inspection_number', 'DESC')
      .getOne();

    let seq = 1;
    if (latest) {
      const lastSeq = parseInt(
        latest.inspection_number.split('-').pop() ?? '0',
        10,
      );
      seq = lastSeq + 1;
    }

    return `${prefix}-${seq.toString().padStart(4, '0')}`;
  }

  private async updatePOStatusIfFullyReceived(
    poId: string,
    manager: any,
  ): Promise<void> {
    const poLines = await manager.find(PurchaseOrderLine, {
      where: { purchase_order_id: poId },
    });

    const allFullyReceived = poLines.every(
      (l: PurchaseOrderLine) =>
        parseFloat(String(l.quantity_received)) >=
        parseFloat(String(l.quantity_ordered)),
    );

    const anyReceived = poLines.some(
      (l: PurchaseOrderLine) =>
        parseFloat(String(l.quantity_received)) > 0,
    );

    let newStatus: string;
    if (allFullyReceived) {
      newStatus = 'RECEIVED';
    } else if (anyReceived) {
      newStatus = 'PARTIALLY_RECEIVED';
    } else {
      return; // No change needed
    }

    await manager.query(
      `UPDATE "purchase_orders"
       SET "status" = $1, "updated_at" = NOW()
       WHERE "id" = $2 AND "status" NOT IN ('RECEIVED', 'CLOSED', 'CANCELLED')`,
      [newStatus, poId],
    );
  }
}
