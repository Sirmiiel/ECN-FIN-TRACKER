/**
 * ECN Tracker - Bank Integration Service
 * 
 * This module handles all interactions with the integrated banking partner.
 * Replace the MOCK_BANK_* constants and mock implementations with your
 * actual bank's API credentials and SDK calls.
 * 
 * Supported operations:
 *  - Create savings account for new user
 *  - Get account balance
 *  - Get transaction history
 *  - Initiate internal transfers
 *  - Webhook receiver for inbound deposits
 */

const crypto = require('crypto');
require('dotenv').config();

// ─── Bank API Configuration ─────────────────────────────────────────────────
const BANK_CONFIG = {
  baseUrl:      process.env.BANK_API_BASE_URL     || 'https://api.yourbank.com/v1',
  apiKey:       process.env.BANK_API_KEY          || 'REPLACE_WITH_REAL_KEY',
  apiSecret:    process.env.BANK_API_SECRET       || 'REPLACE_WITH_REAL_SECRET',
  institutionId: process.env.BANK_INSTITUTION_ID  || 'ECN_INSTITUTION_001',
  productId:    process.env.BANK_SAVINGS_PRODUCT_ID || 'SAVINGS_120DAY',
  webhookSecret: process.env.BANK_WEBHOOK_SECRET  || 'REPLACE_WITH_WEBHOOK_SECRET',
  currency:     process.env.BANK_CURRENCY         || 'USD',
  environment:  process.env.BANK_ENVIRONMENT      || 'sandbox', // 'sandbox' | 'production'
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generate HMAC signature for bank API requests.
 * Most bank APIs require request signing for security.
 */
function signRequest(method, path, body, timestamp) {
  const payload = `${timestamp}${method.toUpperCase()}${path}${body ? JSON.stringify(body) : ''}`;
  return crypto
    .createHmac('sha256', BANK_CONFIG.apiSecret)
    .update(payload)
    .digest('hex');
}

/**
 * Make an authenticated request to the bank API.
 * In production, replace this with the bank's official SDK.
 */
async function bankRequest(method, endpoint, body = null) {
  const timestamp = Date.now().toString();
  const signature = signRequest(method, endpoint, body, timestamp);

  const headers = {
    'Content-Type':        'application/json',
    'X-API-Key':           BANK_CONFIG.apiKey,
    'X-Timestamp':         timestamp,
    'X-Signature':         signature,
    'X-Institution-ID':    BANK_CONFIG.institutionId,
    'X-Environment':       BANK_CONFIG.environment,
  };

  // ── MOCK MODE (sandbox / dev) ─────────────────────────────────────────────
  // Remove this block and uncomment the real fetch() call below when you
  // have live bank credentials.
  if (BANK_CONFIG.environment === 'sandbox' || BANK_CONFIG.apiKey.startsWith('REPLACE')) {
    return mockBankRequest(method, endpoint, body);
  }

  // ── REAL BANK CALL ────────────────────────────────────────────────────────
  // const response = await fetch(`${BANK_CONFIG.baseUrl}${endpoint}`, {
  //   method,
  //   headers,
  //   body: body ? JSON.stringify(body) : undefined,
  // });
  // if (!response.ok) {
  //   const err = await response.json().catch(() => ({}));
  //   throw new Error(err.message || `Bank API error ${response.status}`);
  // }
  // return response.json();
}

// ─── Mock Bank Engine ─────────────────────────────────────────────────────────
// Simulates real bank responses so the whole ECN app runs without credentials.

const mockDb = {
  accounts:     {},   // accountNumber → account object
  transactions: {},   // accountNumber → [tx, ...]
  counter:      1000, // account number seed
};

function mockBankRequest(method, endpoint, body) {
  const segments = endpoint.split('/').filter(Boolean); // e.g. ['accounts', 'ACC123', 'transactions']

  // POST /accounts  →  create account
  if (method === 'POST' && segments[0] === 'accounts' && segments.length === 1) {
    const accountNumber = `ECN${String(++mockDb.counter).padStart(8, '0')}`;
    const account = {
      accountNumber,
      sortCode:       '00-00-00',
      iban:           `GB29NWBK60161${accountNumber}`,
      accountName:    body.accountName,
      productId:      body.productId,
      currency:       BANK_CONFIG.currency,
      balance:        0,
      status:         'active',
      openedAt:       new Date().toISOString(),
      metadata:       body.metadata || {},
    };
    mockDb.accounts[accountNumber]     = account;
    mockDb.transactions[accountNumber] = [];
    console.log(`[MockBank] Created account ${accountNumber} for "${body.accountName}"`);
    return { success: true, data: account };
  }

  // GET /accounts/:accountNumber
  if (method === 'GET' && segments[0] === 'accounts' && segments.length === 2) {
    const acc = mockDb.accounts[segments[1]];
    if (!acc) throw new Error(`Account ${segments[1]} not found`);
    return { success: true, data: acc };
  }

  // GET /accounts/:accountNumber/balance
  if (method === 'GET' && segments[2] === 'balance') {
    const acc = mockDb.accounts[segments[1]];
    if (!acc) throw new Error(`Account ${segments[1]} not found`);
    return { success: true, data: { balance: acc.balance, currency: acc.currency } };
  }

  // GET /accounts/:accountNumber/transactions
  if (method === 'GET' && segments[2] === 'transactions') {
    const txs = mockDb.transactions[segments[1]] || [];
    return { success: true, data: txs };
  }

  // POST /accounts/:accountNumber/deposit  (simulate inbound payment)
  if (method === 'POST' && segments[2] === 'deposit') {
    const acc = mockDb.accounts[segments[1]];
    if (!acc) throw new Error(`Account ${segments[1]} not found`);
    const tx = {
      transactionId: `TXN${Date.now()}`,
      type:          'credit',
      amount:        body.amount,
      currency:      acc.currency,
      description:   body.description || 'Deposit',
      reference:     body.reference   || '',
      timestamp:     new Date().toISOString(),
      balanceAfter:  acc.balance + body.amount,
    };
    acc.balance += body.amount;
    mockDb.transactions[segments[1]].push(tx);
    console.log(`[MockBank] Deposited ${body.amount} → ${segments[1]}. New balance: ${acc.balance}`);
    return { success: true, data: tx };
  }

  // POST /transfers  (internal transfer between ECN accounts)
  if (method === 'POST' && segments[0] === 'transfers') {
    const from = mockDb.accounts[body.fromAccount];
    const to   = mockDb.accounts[body.toAccount];
    if (!from) throw new Error(`Source account ${body.fromAccount} not found`);
    if (!to)   throw new Error(`Destination account ${body.toAccount} not found`);
    if (from.balance < body.amount) throw new Error('Insufficient funds');
    from.balance -= body.amount;
    to.balance   += body.amount;
    const txRef = `TRF${Date.now()}`;
    mockDb.transactions[body.fromAccount].push({ transactionId: txRef, type: 'debit',  amount: body.amount, description: body.description, timestamp: new Date().toISOString(), balanceAfter: from.balance });
    mockDb.transactions[body.toAccount].push({   transactionId: txRef, type: 'credit', amount: body.amount, description: body.description, timestamp: new Date().toISOString(), balanceAfter: to.balance });
    return { success: true, data: { transferId: txRef, status: 'completed' } };
  }

  // PATCH /accounts/:accountNumber  (update account metadata)
  if (method === 'PATCH' && segments[0] === 'accounts' && segments.length === 2) {
    const acc = mockDb.accounts[segments[1]];
    if (!acc) throw new Error(`Account ${segments[1]} not found`);
    Object.assign(acc, body);
    return { success: true, data: acc };
  }

  throw new Error(`MockBank: unhandled ${method} ${endpoint}`);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a bank savings account for a newly registered ECN user.
 * Called automatically during user registration.
 *
 * @param {object} opts
 * @param {string} opts.userId          - ECN internal user ID
 * @param {string} opts.uniqueUserId    - ECN user-facing ID (e.g. "john_doe")
 * @param {string} opts.name            - Full name
 * @param {string} opts.planType        - 'daily' | 'weekly'
 * @param {string} opts.campaignStart   - ISO date string for campaign start
 * @returns {object} bankAccount
 */
async function createBankAccount({ userId, uniqueUserId, name, planType, campaignStart }) {
  const result = await bankRequest('POST', '/accounts', {
    accountName: name,
    productId:   BANK_CONFIG.productId,
    currency:    BANK_CONFIG.currency,
    metadata: {
      ecnUserId:      userId,
      ecnUniqueId:    uniqueUserId,
      planType,
      campaignStart,
      createdVia:     'ECN_TRACKER_AUTO',
    },
  });

  if (!result.success) {
    throw new Error(`Failed to create bank account: ${result.message}`);
  }

  return result.data;
}

/**
 * Fetch live balance for a user's bank account.
 */
async function getBankBalance(accountNumber) {
  const result = await bankRequest('GET', `/accounts/${accountNumber}/balance`);
  return result.data.balance;
}

/**
 * Fetch transaction history from the bank.
 */
async function getBankTransactions(accountNumber) {
  const result = await bankRequest('GET', `/accounts/${accountNumber}/transactions`);
  return result.data;
}

/**
 * Record a verified deposit against the bank account.
 * Called when an admin verifies a payment in ECN Tracker.
 */
async function recordDepositToBank(accountNumber, amount, description, reference) {
  const result = await bankRequest('POST', `/accounts/${accountNumber}/deposit`, {
    amount,
    description,
    reference,
  });
  return result.data;
}

/**
 * Verify that a webhook call genuinely came from the bank.
 */
function verifyWebhookSignature(rawBody, signature) {
  const expected = crypto
    .createHmac('sha256', BANK_CONFIG.webhookSecret)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/**
 * Get full account details.
 */
async function getAccountDetails(accountNumber) {
  const result = await bankRequest('GET', `/accounts/${accountNumber}`);
  return result.data;
}

module.exports = {
  createBankAccount,
  getBankBalance,
  getBankTransactions,
  recordDepositToBank,
  verifyWebhookSignature,
  getAccountDetails,
  BANK_CONFIG,
};
