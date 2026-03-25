const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { pool, transaction }      = require('../config/database');
const { logAction }              = require('../middleware/audit');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { createBankAccount }      = require('../services/bankIntegration');
const logger = require('../config/logger');

const router = express.Router();

// ─── Brute-force protection (in-memory) ──────────────────────────────────────
const LOGIN_MAX_ATTEMPTS     = parseInt(process.env.LOGIN_MAX_ATTEMPTS || '5');
const LOGIN_LOCKOUT_MINUTES  = parseInt(process.env.LOGIN_LOCKOUT_MINUTES || '15');
const loginAttempts = new Map(); // key: uniqueUserId → { count, lastAttempt }

function checkBruteForce(uniqueUserId) {
  const record = loginAttempts.get(uniqueUserId);
  if (!record) return { locked: false };

  const elapsed = Date.now() - record.lastAttempt;
  const lockoutMs = LOGIN_LOCKOUT_MINUTES * 60 * 1000;

  // Lockout expired → reset
  if (elapsed > lockoutMs) {
    loginAttempts.delete(uniqueUserId);
    return { locked: false };
  }

  if (record.count >= LOGIN_MAX_ATTEMPTS) {
    const remainingSec = Math.ceil((lockoutMs - elapsed) / 1000);
    return { locked: true, remainingSec };
  }

  return { locked: false };
}

function recordFailedAttempt(uniqueUserId) {
  const record = loginAttempts.get(uniqueUserId) || { count: 0, lastAttempt: 0 };
  record.count += 1;
  record.lastAttempt = Date.now();
  loginAttempts.set(uniqueUserId, record);
}

function clearAttempts(uniqueUserId) {
  loginAttempts.delete(uniqueUserId);
}

// Register new user (admin only) — auto-creates bank account
router.post('/register', authMiddleware, adminMiddleware,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('uniqueUserId').trim().notEmpty().isLength({ min: 3, max: 50 }),
    body('pin').isLength({ min: 4, max: 8 }),
    body('role').optional().isIn(['admin', 'member']),
    body('planType').optional().isIn(['daily', 'weekly']),
    body('targetAmount').optional().isDecimal(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, uniqueUserId, pin, role = 'member', planType = 'daily', targetAmount } = req.body;

    try {
      const existing = await pool.query('SELECT id FROM users WHERE unique_user_id = $1', [uniqueUserId]);
      if (existing.rows.length > 0) return res.status(409).json({ error: 'User ID already exists' });

      const pinHash = await bcrypt.hash(pin, 10);
      const campaignStartDate = process.env.CAMPAIGN_START_DATE || new Date().toISOString().split('T')[0];

      const { user, bankAccount } = await transaction(async (client) => {
        const userRes = await client.query(
          `INSERT INTO users (name, unique_user_id, pin_hash, role, plan_type, target_amount, bank_account_status)
           VALUES ($1,$2,$3,$4,$5,$6,'pending')
           RETURNING id, name, unique_user_id, role, plan_type, balance, target_amount, created_at`,
          [name, uniqueUserId, pinHash, role, planType, targetAmount || null]
        );
        const newUser = userRes.rows[0];

        let bankAccData = null;
        try {
          bankAccData = await createBankAccount({ userId: newUser.id, uniqueUserId, name, planType, campaignStart: campaignStartDate });
        } catch (bankErr) {
          console.error('Bank account creation failed (will retry):', bankErr.message);
        }

        if (bankAccData) {
          await client.query(
            `UPDATE users SET bank_account_number=$1, bank_iban=$2, bank_sort_code=$3, bank_account_status='active', updated_at=CURRENT_TIMESTAMP WHERE id=$4`,
            [bankAccData.accountNumber, bankAccData.iban, bankAccData.sortCode, newUser.id]
          );
          await client.query(
            `INSERT INTO bank_accounts (user_id, account_number, iban, sort_code, account_name, product_id, currency, status, opened_at, metadata)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'active',CURRENT_TIMESTAMP,$8)`,
            [newUser.id, bankAccData.accountNumber, bankAccData.iban, bankAccData.sortCode, name, bankAccData.productId, bankAccData.currency, JSON.stringify(bankAccData.metadata || {})]
          );
        }

        await logAction('USER_REGISTERED_WITH_BANK_ACCOUNT', req.user.id, 'user', newUser.id,
          { name, uniqueUserId, role, bankAccountNumber: bankAccData?.accountNumber || null }, req.ip);

        return { user: newUser, bankAccount: bankAccData };
      });

      res.status(201).json({
        message: 'User registered. Bank account created automatically.',
        user: { id: user.id, name: user.name, uniqueUserId: user.unique_user_id, role: user.role, planType: user.plan_type, balance: user.balance },
        bankAccount: bankAccount
          ? { accountNumber: bankAccount.accountNumber, iban: bankAccount.iban, sortCode: bankAccount.sortCode, currency: bankAccount.currency, status: 'active' }
          : { status: 'pending', message: 'Bank account provisioning in progress.' },
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
);

// Login
router.post('/login',
  [body('uniqueUserId').trim().notEmpty(), body('pin').notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { uniqueUserId, pin } = req.body;

    // Brute-force check
    const bf = checkBruteForce(uniqueUserId);
    if (bf.locked) {
      logger.warn('Login locked out', { uniqueUserId, remainingSec: bf.remainingSec });
      return res.status(429).json({
        error: `Too many failed attempts. Try again in ${Math.ceil(bf.remainingSec / 60)} minute(s).`,
      });
    }

    try {
      const result = await pool.query(
        'SELECT id, name, unique_user_id, pin_hash, role, is_active, bank_account_number, bank_account_status FROM users WHERE unique_user_id = $1',
        [uniqueUserId]
      );
      if (result.rows.length === 0) {
        recordFailedAttempt(uniqueUserId);
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const user = result.rows[0];
      if (!user.is_active) return res.status(403).json({ error: 'Account is inactive' });
      const validPin = await bcrypt.compare(pin, user.pin_hash);
      if (!validPin) {
        recordFailedAttempt(uniqueUserId);
        logger.warn('Failed login attempt', { uniqueUserId, ip: req.ip });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Success — clear any failed attempt history
      clearAttempts(uniqueUserId);

      const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '24h' });
      await logAction('USER_LOGIN', user.id, 'user', user.id, {}, req.ip);
      logger.info('User logged in', { userId: user.id, uniqueUserId });
      res.json({ message: 'Login successful', token, user: { id: user.id, name: user.name, uniqueUserId: user.unique_user_id, role: user.role, bankAccountNumber: user.bank_account_number, bankAccountStatus: user.bank_account_status } });
    } catch (error) {
      logger.error('Login error', { error: error.message });
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

// Get profile (includes bank account info)
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.unique_user_id, u.role, u.plan_type, u.balance, u.target_amount,
              u.plan_start_date, u.created_at, u.bank_account_number, u.bank_account_status,
              ba.iban, ba.sort_code, ba.currency, ba.status as bank_status, ba.opened_at as bank_opened_at
       FROM users u LEFT JOIN bank_accounts ba ON ba.user_id = u.id WHERE u.id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const row = result.rows[0];
    res.json({
      user: { id: row.id, name: row.name, uniqueUserId: row.unique_user_id, role: row.role, planType: row.plan_type, balance: row.balance, targetAmount: row.target_amount, planStartDate: row.plan_start_date },
      bankAccount: { accountNumber: row.bank_account_number, iban: row.iban, sortCode: row.sort_code, currency: row.currency, status: row.bank_account_status || row.bank_status, openedAt: row.bank_opened_at },
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Change PIN
router.put('/change-pin', authMiddleware,
  [body('currentPin').notEmpty(), body('newPin').isLength({ min: 4, max: 8 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { currentPin, newPin } = req.body;
    try {
      const result = await pool.query('SELECT pin_hash FROM users WHERE id = $1', [req.user.id]);
      const valid = await bcrypt.compare(currentPin, result.rows[0].pin_hash);
      if (!valid) return res.status(401).json({ error: 'Current PIN is incorrect' });
      const newHash = await bcrypt.hash(newPin, 10);
      await pool.query('UPDATE users SET pin_hash=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2', [newHash, req.user.id]);
      await logAction('PIN_CHANGED', req.user.id, 'user', req.user.id, {}, req.ip);
      res.json({ message: 'PIN changed successfully' });
    } catch (error) {
      console.error('PIN change error:', error);
      res.status(500).json({ error: 'Failed to change PIN' });
    }
  }
);

module.exports = router;
