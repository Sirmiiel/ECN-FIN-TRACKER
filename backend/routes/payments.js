const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 }             = require('uuid');
const { pool, transaction }      = require('../config/database');
const { logAction }              = require('../middleware/audit');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { allocatePayment, persistAllocation, previewAllocation, getContributionCalendar } = require('../services/paymentAllocator');
const { recordDepositToBank }    = require('../services/bankIntegration');

const router = express.Router();

async function getCampaignConfig() {
  return {
    campaignStartDate: new Date(process.env.CAMPAIGN_START_DATE || '2025-02-10'),
    campaignDays:      parseInt(process.env.CAMPAIGN_DURATION_DAYS || '120'),
  };
}

async function getUserPlanRate(userId) {
  const res = await pool.query(
    `SELECT u.plan_type, sp.expected_amount as rate FROM users u JOIN savings_plans sp ON sp.plan_name=u.plan_type WHERE u.id=$1`,
    [userId]
  );
  if (!res.rows.length) throw new Error('User or plan not found');
  return { planType: res.rows[0].plan_type, ratePerPeriod: parseFloat(res.rows[0].rate) };
}

// Preview allocation before submitting
router.get('/preview', authMiddleware, async (req, res) => {
  const amount = parseFloat(req.query.amount);
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount required' });
  try {
    const { campaignStartDate, campaignDays } = await getCampaignConfig();
    const { planType, ratePerPeriod }          = await getUserPlanRate(req.user.id);
    const allocation = await previewAllocation({ userId: req.user.id, amount, campaignStart: campaignStartDate, campaignDays, planType, ratePerPeriod });
    res.json({ preview: allocation });
  } catch (err) {
    console.error('Preview error:', err);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// Contribution calendar (which days are paid/missed/upcoming)
router.get('/calendar', authMiddleware, async (req, res) => {
  const targetUserId = req.user.role === 'admin' && req.query.userId ? parseInt(req.query.userId) : req.user.id;
  try {
    const { campaignStartDate, campaignDays } = await getCampaignConfig();
    const { planType, ratePerPeriod }          = await getUserPlanRate(targetUserId);
    const calendar = await getContributionCalendar({ userId: targetUserId, campaignStart: campaignStartDate, campaignDays, planType, ratePerPeriod });
    res.json({ calendar, planType, ratePerPeriod });
  } catch (err) {
    console.error('Calendar error:', err);
    res.status(500).json({ error: 'Failed to fetch calendar' });
  }
});

// Submit payment
router.post('/submit', authMiddleware,
  [body('amount').isDecimal({ decimal_digits: '0,2' }).custom(v => parseFloat(v) > 0), body('paymentMethod').optional().trim().isLength({ max: 50 }), body('idempotencyKey').notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { amount, paymentMethod, idempotencyKey } = req.body;
    try {
      const dupe = await pool.query('SELECT payment_id, status FROM payments WHERE idempotency_key=$1', [idempotencyKey]);
      if (dupe.rows.length > 0) return res.status(200).json({ message: 'Payment already submitted', payment: dupe.rows[0] });

      const { campaignStartDate, campaignDays } = await getCampaignConfig();
      const { planType, ratePerPeriod }          = await getUserPlanRate(req.user.id);
      const allocation = await previewAllocation({ userId: req.user.id, amount: parseFloat(amount), campaignStart: campaignStartDate, campaignDays, planType, ratePerPeriod });

      const paymentId = uuidv4();
      await pool.query(
        `INSERT INTO payments (payment_id,user_id,amount,payment_method,idempotency_key,status,allocation_summary) VALUES ($1,$2,$3,$4,$5,'pending',$6)`,
        [paymentId, req.user.id, amount, paymentMethod, idempotencyKey, allocation.summary]
      );
      await logAction('PAYMENT_SUBMITTED', req.user.id, 'payment', paymentId, { amount, allocationSummary: allocation.summary }, req.ip);
      res.status(201).json({ message: 'Payment submitted and pending verification.', payment: { paymentId, amount, status: 'pending' }, allocationPreview: allocation });
    } catch (err) {
      console.error('Submit error:', err);
      res.status(500).json({ error: 'Failed to submit payment' });
    }
  }
);

// Verify payment (admin only)
router.put('/:paymentId/verify', authMiddleware, adminMiddleware,
  [body('status').isIn(['verified','rejected']), body('notes').optional().trim()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { paymentId } = req.params;
    const { status, notes } = req.body;
    try {
      await transaction(async (client) => {
        const payRes = await client.query('SELECT * FROM payments WHERE payment_id=$1 AND status=$2 FOR UPDATE', [paymentId, 'pending']);
        if (!payRes.rows.length) throw new Error('Payment not found or already processed');
        const payment = payRes.rows[0];
        await client.query(
          `UPDATE payments SET status=$1,verification_notes=$2,verified_by=$3,verified_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE payment_id=$4`,
          [status, notes, req.user.id, paymentId]
        );
        if (status === 'verified') {
          const userRes = await client.query(
            `SELECT u.id, u.bank_account_number, u.plan_type, sp.expected_amount as rate FROM users u JOIN savings_plans sp ON sp.plan_name=u.plan_type WHERE u.id=$1`,
            [payment.user_id]
          );
          const userRow = userRes.rows[0];
          const { campaignStartDate, campaignDays } = await getCampaignConfig();
          const allocation = await allocatePayment({ userId: payment.user_id, amount: parseFloat(payment.amount), campaignStart: campaignStartDate, campaignDays, planType: userRow.plan_type, ratePerPeriod: parseFloat(userRow.rate) });
          await persistAllocation(client, paymentId, allocation);
          await client.query(
            `UPDATE users SET balance=(SELECT COALESCE(SUM(amount),0) FROM payments WHERE user_id=$1 AND status='verified'),updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
            [payment.user_id]
          );
          if (userRow.bank_account_number) {
            try { await recordDepositToBank(userRow.bank_account_number, parseFloat(payment.amount), `ECN deposit (${allocation.summary})`, paymentId); }
            catch (bankErr) { console.error('Bank record failed (non-fatal):', bankErr.message); }
          }
          await logAction('PAYMENT_VERIFIED', req.user.id, 'payment', paymentId, { amount: payment.amount, userId: payment.user_id, allocationSummary: allocation.summary, periodsFullyCovered: allocation.periodsFullyCovered }, req.ip);
        } else {
          await logAction('PAYMENT_REJECTED', req.user.id, 'payment', paymentId, { notes }, req.ip);
        }
      });
      res.json({ message: `Payment ${status} successfully.`, paymentId });
    } catch (err) {
      console.error('Verify error:', err);
      if (err.message === 'Payment not found or already processed') return res.status(404).json({ error: err.message });
      res.status(500).json({ error: 'Failed to verify payment' });
    }
  }
);

// Payment history
router.get('/history', authMiddleware, async (req, res) => {
  const { status, limit = 50, offset = 0 } = req.query;
  try {
    let q = `SELECT p.payment_id,p.amount,p.payment_date,p.status,p.payment_method,p.verification_notes,p.verified_at,p.allocation_summary,p.covered_periods,u.name as verified_by_name FROM payments p LEFT JOIN users u ON p.verified_by=u.id WHERE p.user_id=$1`;
    const params = [req.user.id];
    if (status) { params.push(status); q += ` AND p.status=$${params.length}`; }
    q += ` ORDER BY p.payment_date DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
    params.push(limit, offset);
    const result = await pool.query(q, params);
    const countRes = await pool.query(`SELECT COUNT(*) FROM payments WHERE user_id=$1${status?' AND status=$2':''}`, status ? [req.user.id, status] : [req.user.id]);
    res.json({ payments: result.rows, total: parseInt(countRes.rows[0].count), limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

// Pending payments (admin)
router.get('/pending', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.payment_id,p.amount,p.payment_date,p.payment_method,p.allocation_summary,u.id as user_id,u.name as user_name,u.unique_user_id,u.bank_account_number,ROUND(EXTRACT(EPOCH FROM (NOW()-p.payment_date))/3600,1) as hours_pending FROM payments p JOIN users u ON p.user_id=u.id WHERE p.status='pending' ORDER BY p.payment_date ASC`
    );
    res.json({ payments: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending payments' });
  }
});

// Single payment detail
router.get('/:paymentId', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*,u.name as user_name,u.unique_user_id,v.name as verified_by_name FROM payments p JOIN users u ON p.user_id=u.id LEFT JOIN users v ON p.verified_by=v.id WHERE p.payment_id=$1`,
      [req.params.paymentId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Payment not found' });
    const payment = result.rows[0];
    if (req.user.role !== 'admin' && payment.user_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });
    res.json({ payment });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payment details' });
  }
});

module.exports = router;
