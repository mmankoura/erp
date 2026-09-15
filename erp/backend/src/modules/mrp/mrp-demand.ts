/**
 * Shared MRP demand primitives.
 *
 * Before this module existed, the requirement formula was written out by hand in
 * fourteen places across four modules (mrp x7, inventory x5, kitting x1,
 * production x2) and the "which orders count" status list in nine. They drifted:
 * the Inventory page's "Required" column was computed independently of MRP and
 * could disagree with it for the same part at the same instant.
 *
 * Everything here is pure — no repositories, no decorators, no I/O — so it can
 * be tested directly and reused from any module without dragging MRP's
 * dependency graph along.
 */
import { OrderStatus } from '../../entities/order.entity';
import { ResourceType } from '../../entities/bom-item.entity';

/**
 * Orders that consume material and are not yet finished.
 *
 * SHIPPED is done, CANCELLED is gone, and ON_HOLD deliberately keeps its
 * material claim (the order is paused, not abandoned) but is excluded here
 * because the buyer should not be told to purchase for work that is stopped.
 */
export const DEFAULT_MRP_STATUSES: readonly OrderStatus[] = [
  OrderStatus.ENTERED,
  OrderStatus.KITTING,
  OrderStatus.SMT,
  OrderStatus.TH,
];

/**
 * Quantities are decimal(10,4) in Postgres and arrive as strings via TypeORM, so
 * comparisons accumulate float error. A material with supply exactly equal to
 * demand lands a hair either side of zero; without a tolerance it is reported as
 * short by 0.000000001 of a part. One part in ten thousand is the smallest
 * quantity the schema can represent, so anything under 1e-6 is noise.
 */
export const QTY_EPSILON = 1e-6;

/** TypeORM hands decimal columns back as strings; numeric columns as numbers. */
function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The requirement for one BOM line on one job.
 *
 *   required = job_quantity x per_unit_quantity x (1 + scrap_factor / 100)
 *
 * This is the same arithmetic the buyer's spreadsheet performs as
 * `= job_qty_row * per_unit_cell`, with scrap added.
 *
 * Callers must accumulate raw values and round only when reporting — see
 * {@link roundQty}.
 */
export function lineDemand(
  jobQuantity: number | string | null | undefined,
  perUnitQuantity: number | string | null | undefined,
  scrapFactorPercent: number | string | null | undefined,
): number {
  const qty = toNumber(jobQuantity);
  const perUnit = toNumber(perUnitQuantity);
  const scrap = toNumber(scrapFactorPercent);
  return qty * perUnit * (1 + scrap / 100);
}

/**
 * Round a quantity for display, at the reporting boundary only.
 *
 * Rounding during accumulation changes totals: round-then-sum and
 * sum-then-round disagree once scrap produces repeating decimals. The existing
 * service accumulates raw and rounds at the end, and that behaviour is
 * preserved deliberately.
 */
export function roundQty(value: number): number {
  return Math.ceil(value * 10000) / 10000;
}

/**
 * Whether a material is something the buyer actually procures.
 *
 * DNP ("do not populate") lines exist in a BOM to record a component that is
 * deliberately *not* fitted — a depopulated option, a placeholder for a variant.
 * Counting them as demand asks the buyer to purchase parts that will never be
 * placed. Kitting has always skipped them (kitting.service.ts:679); MRP never
 * did, so a material literally named "Do Not Populate" was showing 39,905 units
 * of demand on the All Requirements tab and inflating the headline shortage.
 */
export function isProcurable(
  resourceType: ResourceType | string | null | undefined,
): boolean {
  return resourceType !== ResourceType.DNP;
}

/**
 * How a material stands once demand has been netted against supply.
 *
 * `EXACT` is the state the old `shortage > 0` filter could not express. A part
 * with supply exactly equal to demand is not comfortable — it has zero margin,
 * so any scrap, miscount or damaged reel makes it short immediately. In the
 * buyer's own spreadsheet 42 such parts sit directly beneath the shortages
 * because the sheet is sorted by Net; in the ERP they were invisible.
 */
export type MaterialState =
  | 'SHORT'
  | 'EXACT'
  | 'COVERED_BY_PO'
  | 'OK'
  | 'DORMANT';

/**
 * Classify a material from its supply and demand. The states are mutually
 * exclusive and are tested in order of urgency.
 *
 * Two different "nets" matter, and conflating them is what made the old code
 * ambiguous:
 *
 *   total net = on_hand + on_order - demand   -> is anything actually missing?
 *   shelf net = on_hand - demand              -> can it be built today?
 *
 * `EXACT` is deliberately defined on the **shelf** net, because that is the
 * number the buyer's spreadsheet computes in its `Net` column and the sense in
 * which they mean "exactly enough". A part with 30 on hand, 10 on order and
 * demand of 40 is not "exact" — it is `COVERED_BY_PO`, which is a different and
 * more useful warning: nothing is missing, but only because a purchase order is
 * still open, and if that PO slips the part goes short.
 */
export function classifyState(
  onHand: number,
  onOrder: number,
  grossDemand: number,
): MaterialState {
  if (grossDemand <= QTY_EPSILON) return 'DORMANT';

  const totalNet = onHand + onOrder - grossDemand;
  if (totalNet < -QTY_EPSILON) return 'SHORT';

  const shelfNet = onHand - grossDemand;
  if (shelfNet < -QTY_EPSILON) return 'COVERED_BY_PO';
  if (Math.abs(shelfNet) <= QTY_EPSILON) return 'EXACT';
  return 'OK';
}

/**
 * States a procurement report must surface.
 *
 * `OK` and `DORMANT` are omitted: nothing is required of the buyer. `EXACT` is
 * included precisely because the old filter dropped it.
 */
export function isReportable(state: MaterialState): boolean {
  return state === 'SHORT' || state === 'EXACT' || state === 'COVERED_BY_PO';
}
