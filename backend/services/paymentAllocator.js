/**
 * ECN Tracker - Smart Payment Allocator
 *
 * When a user deposits a lump sum, this service calculates exactly which
 * contribution "slots" (days or weeks) that amount covers — filling
 * missed past slots first, then reserving future slots.
 *
 * Example (daily plan, daily rate = 1,000):
 *   - Today is Day 10
 *   - User paid on days 1–4, missed days 5–10
 *   - User deposits 10,000
 *   → Fills missed days 5, 6, 7, 8, 9, 10  (6 × 1,000 = 6,000)
 *   → Pre-pays future days 11, 12, 13, 14  (4 × 1,000 = 4,000)
 *   → Total accounted: 10,000  ✓
 */

const { pool } = require('../config/database');

// ─── Types (JSDoc) ────────────────────────────────────────────────────────────
/**
 * @typedef {Object} AllocationSlot
 * @property {string}  date          - YYYY-MM-DD
 * @property {number}  periodNumber  - 1-based day or week number
 * @property {'past'|'current'|'future'} slotType
 * @property {number}  required      - Amount required for this slot
 * @property {number}  covered       - Amount this payment covers for the slot
 * @property {boolean} fullyCovered  - Whether the slot is 100% paid
 * @property {boolean} partiallyCovered
 */

/**
 * @typedef {Object} AllocationResult
 * @property {number}           totalAmount
 * @property {number}           ratePerPeriod
 * @property {string}           planType
 * @property {AllocationSlot[]} slots
 * @property {number}           periodsFullyCovered
 * @property {number}           missedPeriodsCovered
 * @property {number}           futurePeriodsCovered
 * @property {number}           currentPeriodCovered   - partial or full
 * @property {number}           remainderUnallocated   - leftover (if any)
 * @property {string}           summary
 */

// ─── Core Algorithm ───────────────────────────────────────────────────────────

/**
 * Calculate how a lump-sum payment distributes across contribution slots.
 *
 * @param {object} params
 * @param {number} params.userId            - ECN user ID
 * @param {number} params.amount            - Payment amount (positive)
 * @param {Date}   params.campaignStart     - When the campaign began
 * @param {number} params.campaignDays      - Total campaign length (e.g. 120)
 * @param {'daily'|'weekly'} params.planType
 * @param {number} params.ratePerPeriod     - Expected amount per day or week
 * @returns {Promise<AllocationResult>}
 */
async function allocatePayment({ userId, amount, campaignStart, campaignDays, planType, ratePerPeriod }) {
  if (amount <= 0) throw new Error('Payment amount must be positive');
  if (ratePerPeriod <= 0) throw new Error('Rate per period must be positive');

  const today      = new Date();
  today.setHours(0, 0, 0, 0);
  const start      = new Date(campaignStart);
  start.setHours(0, 0, 0, 0);
  const periodLen  = planType === 'weekly' ? 7 : 1;   // days per slot

  // Total number of slots in the campaign
  const totalPeriods = Math.ceil(campaignDays / periodLen);

  // Which slot number is "today" (1-based)?
  const daysSinceStart  = Math.floor((today - start) / 86400000);
  const currentPeriodNo = Math.min(Math.floor(daysSinceStart / periodLen) + 1, totalPeriods);

  // Fetch previously VERIFIED payments for this user to know which slots are paid
  const existingPayments = await pool.query(
    `SELECT amount, payment_date, covered_periods
     FROM payments
     WHERE user_id = $1
       AND status = 'verified'
     ORDER BY payment_date ASC`,
    [userId]
  );

  // Build a map: periodNumber → total already paid towards it
  const paidMap = buildPaidMap(existingPayments.rows, start, periodLen, ratePerPeriod);

  // ── Allocate the new amount greedily: oldest unfilled slot first ──────────
  let remaining  = amount;
  const slots    = [];

  // We check ALL periods from 1 → (currentPeriod + enough future slots)
  const maxFuture = totalPeriods; // can pre-pay all remaining periods
  const periodsToCheck = maxFuture;

  let missedCovered  = 0;
  let futureCovered  = 0;
  let currentCovered = 0;

  for (let p = 1; p <= periodsToCheck && remaining > 0; p++) {
    const slotDate   = slotStartDate(start, p, periodLen);
    const alreadyPaid = paidMap[p] || 0;
    const stillNeeded = Math.max(0, ratePerPeriod - alreadyPaid);

    if (stillNeeded === 0) continue; // already fully paid

    const cover = Math.min(stillNeeded, remaining);
    remaining   -= cover;

    const slotType = p < currentPeriodNo ? 'past'
                   : p === currentPeriodNo ? 'current'
                   : 'future';

    const slot = {
      date:             formatDate(slotDate),
      periodNumber:     p,
      slotType,
      required:         ratePerPeriod,
      alreadyPaid,
      covered:          cover,
      totalPaid:        alreadyPaid + cover,
      fullyCovered:     (alreadyPaid + cover) >= ratePerPeriod,
      partiallyCovered: (alreadyPaid + cover) > 0 && (alreadyPaid + cover) < ratePerPeriod,
    };
    slots.push(slot);

    if (slotType === 'past')    missedCovered++;
    if (slotType === 'current') currentCovered = slot.fullyCovered ? 1 : 0;
    if (slotType === 'future')  futureCovered++;
  }

  const periodsFullyCovered = slots.filter(s => s.fullyCovered).length;

  // Human-readable summary
  const parts = [];
  if (missedCovered > 0) {
    parts.push(`${missedCovered} missed ${pluralPeriod(planType, missedCovered)}`);
  }
  if (currentCovered) {
    parts.push(`today's contribution`);
  }
  if (futureCovered > 0) {
    parts.push(`${futureCovered} upcoming ${pluralPeriod(planType, futureCovered)}`);
  }

  const summary = parts.length
    ? `This payment covers ${parts.join(', ')}.`
    : 'This payment partially covers your current obligation.';

  return {
    totalAmount:          amount,
    ratePerPeriod,
    planType,
    slots,
    periodsFullyCovered,
    missedPeriodsCovered: missedCovered,
    futurePeriodsCovered: futureCovered,
    currentPeriodCovered: currentCovered,
    remainderUnallocated: Math.max(0, remaining),
    summary,
  };
}

// ─── Persist Allocation ───────────────────────────────────────────────────────

/**
 * After admin verifies a payment, call this to persist the slot allocations
 * so future allocations know which slots are already paid.
 *
 * Updates the `covered_periods` JSONB column on the payments row.
 */
async function persistAllocation(client, paymentId, allocationResult) {
  const coveredPeriods = allocationResult.slots.map(s => ({
    periodNumber: s.periodNumber,
    date:         s.date,
    covered:      s.covered,
    fullyCovered: s.fullyCovered,
  }));

  await client.query(
    `UPDATE payments
     SET covered_periods = $1, updated_at = CURRENT_TIMESTAMP
     WHERE payment_id = $2`,
    [JSON.stringify(coveredPeriods), paymentId]
  );
}

// ─── Preview (no DB writes) ───────────────────────────────────────────────────

/**
 * Lightweight preview — called before payment submission so the UI can
 * show the user exactly what their deposit will cover.
 *
 * Same algorithm as allocatePayment but skips DB persistence.
 */
async function previewAllocation({ userId, amount, campaignStart, campaignDays, planType, ratePerPeriod }) {
  return allocatePayment({ userId, amount, campaignStart, campaignDays, planType, ratePerPeriod });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a map of { periodNumber → totalPaidSoFar } from verified payments.
 */
function buildPaidMap(rows, start, periodLen, ratePerPeriod) {
  const map = {};
  for (const row of rows) {
    if (row.covered_periods) {
      // Payment has explicit allocation data
      const periods = typeof row.covered_periods === 'string'
        ? JSON.parse(row.covered_periods)
        : row.covered_periods;
      for (const cp of periods) {
        map[cp.periodNumber] = (map[cp.periodNumber] || 0) + cp.covered;
      }
    } else {
      // Legacy payment without allocation — assign to the period it was made in
      const payDate  = new Date(row.payment_date);
      payDate.setHours(0, 0, 0, 0);
      const daysDiff = Math.floor((payDate - start) / 86400000);
      const period   = Math.floor(daysDiff / periodLen) + 1;
      map[period]    = (map[period] || 0) + parseFloat(row.amount);
    }
  }
  return map;
}

function slotStartDate(campaignStart, periodNumber, periodLen) {
  const d = new Date(campaignStart);
  d.setDate(d.getDate() + (periodNumber - 1) * periodLen);
  return d;
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function pluralPeriod(planType, count) {
  const base = planType === 'weekly' ? 'week' : 'day';
  return count === 1 ? base : `${base}s`;
}

// ─── Status Checker ───────────────────────────────────────────────────────────

/**
 * Returns a full contribution calendar for a user — every slot with its
 * payment status. Used to render the calendar UI.
 *
 * @returns {Array<{ periodNumber, date, status: 'paid'|'partial'|'missed'|'upcoming'|'current', paidAmount, required }>}
 */
async function getContributionCalendar({ userId, campaignStart, campaignDays, planType, ratePerPeriod }) {
  const today     = new Date();
  today.setHours(0, 0, 0, 0);
  const start     = new Date(campaignStart);
  start.setHours(0, 0, 0, 0);
  const periodLen = planType === 'weekly' ? 7 : 1;
  const totalPeriods = Math.ceil(campaignDays / periodLen);
  const daysSinceStart  = Math.floor((today - start) / 86400000);
  const currentPeriodNo = Math.min(Math.floor(daysSinceStart / periodLen) + 1, totalPeriods);

  const existing = await pool.query(
    `SELECT amount, payment_date, covered_periods
     FROM payments WHERE user_id = $1 AND status = 'verified'
     ORDER BY payment_date ASC`,
    [userId]
  );

  const paidMap = buildPaidMap(existing.rows, start, periodLen, ratePerPeriod);

  const calendar = [];
  for (let p = 1; p <= totalPeriods; p++) {
    const slotDate  = slotStartDate(start, p, periodLen);
    const paid      = paidMap[p] || 0;
    const isInPast  = p < currentPeriodNo;
    const isCurrent = p === currentPeriodNo;
    const isFuture  = p > currentPeriodNo;

    let status;
    if      (paid >= ratePerPeriod)          status = 'paid';
    else if (paid > 0 && paid < ratePerPeriod) status = 'partial';
    else if (isInPast)                       status = 'missed';
    else if (isCurrent)                      status = 'current';
    else                                     status = 'upcoming';

    calendar.push({
      periodNumber: p,
      date:         formatDate(slotDate),
      status,
      paidAmount:   paid,
      required:     ratePerPeriod,
      deficit:      Math.max(0, ratePerPeriod - paid),
    });
  }

  return calendar;
}

module.exports = {
  allocatePayment,
  persistAllocation,
  previewAllocation,
  getContributionCalendar,
};
