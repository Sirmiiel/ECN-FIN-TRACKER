/**
 * Migration 002 - Bank Integration & Payment Allocation
 *
 * Adds:
 *  1. bank_account_number, bank_iban, bank_sort_code, bank_account_status to users
 *  2. covered_periods (JSONB) to payments - stores which day/week slots the payment fills
 *  3. bank_transaction_id to payments  - reference back to bank ledger
 *  4. bank_accounts table              - full bank account record per user
 */

const { pool } = require('../config/database');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1. Add bank columns to users ─────────────────────────────────────────
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(20)  UNIQUE,
        ADD COLUMN IF NOT EXISTS bank_iban            VARCHAR(34),
        ADD COLUMN IF NOT EXISTS bank_sort_code       VARCHAR(10),
        ADD COLUMN IF NOT EXISTS bank_account_status  VARCHAR(20) DEFAULT 'pending'
          CHECK (bank_account_status IN ('pending', 'active', 'suspended', 'closed'))
    `);

    // ── 2. Add allocation columns to payments ────────────────────────────────
    await client.query(`
      ALTER TABLE payments
        ADD COLUMN IF NOT EXISTS covered_periods     JSONB,
        ADD COLUMN IF NOT EXISTS bank_transaction_id VARCHAR(100),
        ADD COLUMN IF NOT EXISTS allocation_summary  TEXT
    `);

    // ── 3. Full bank_accounts table ──────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS bank_accounts (
        id                  SERIAL PRIMARY KEY,
        user_id             INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        account_number      VARCHAR(20) UNIQUE NOT NULL,
        iban                VARCHAR(34),
        sort_code           VARCHAR(10),
        account_name        VARCHAR(255) NOT NULL,
        product_id          VARCHAR(100),
        currency            VARCHAR(3) DEFAULT 'USD',
        status              VARCHAR(20) DEFAULT 'active'
          CHECK (status IN ('pending', 'active', 'suspended', 'closed')),
        bank_reference      VARCHAR(100),
        opened_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_synced_at      TIMESTAMP,
        metadata            JSONB,
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ── 4. Indexes ────────────────────────────────────────────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_bank_accounts_user_id
        ON bank_accounts(user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_bank_tx
        ON payments(bank_transaction_id)
    `);

    await client.query('COMMIT');
    console.log('Migration 002 completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration 002 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { migrate };
