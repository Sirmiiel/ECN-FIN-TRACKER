/**
 * ECN Tracker - Admin Seed Script
 *
 * Creates the first admin user so the system can be bootstrapped.
 * Run once after migrations:
 *
 *   node scripts/seedAdmin.js
 *
 * Default credentials (change after first login):
 *   User ID : admin
 *   PIN     : 1234
 */

const bcrypt = require('bcrypt');
require('dotenv').config();
const { pool } = require('../config/database');

const ADMIN_UNIQUE_ID = process.env.ADMIN_SEED_ID || 'admin';
const ADMIN_NAME      = process.env.ADMIN_SEED_NAME || 'System Admin';
const ADMIN_PIN       = process.env.ADMIN_SEED_PIN || '1234';

async function seedAdmin() {
  const client = await pool.connect();

  try {
    // Check if admin already exists
    const existing = await client.query(
      'SELECT id, unique_user_id FROM users WHERE unique_user_id = $1',
      [ADMIN_UNIQUE_ID]
    );

    if (existing.rows.length > 0) {
      console.log(`Admin user "${ADMIN_UNIQUE_ID}" already exists (id=${existing.rows[0].id}). Skipping.`);
      return;
    }

    const pinHash = await bcrypt.hash(ADMIN_PIN, 10);

    const result = await client.query(
      `INSERT INTO users (name, unique_user_id, pin_hash, role, plan_type, is_active)
       VALUES ($1, $2, $3, 'admin', 'daily', true)
       RETURNING id, name, unique_user_id, role`,
      [ADMIN_NAME, ADMIN_UNIQUE_ID, pinHash]
    );

    const admin = result.rows[0];

    console.log('');
    console.log('=== Admin User Created ===');
    console.log(`  ID       : ${admin.id}`);
    console.log(`  Name     : ${admin.name}`);
    console.log(`  User ID  : ${admin.unique_user_id}`);
    console.log(`  Role     : ${admin.role}`);
    console.log(`  PIN      : ${ADMIN_PIN}`);
    console.log('');
    console.log('⚠  Change the default PIN after first login!');
    console.log('');
  } catch (error) {
    console.error('Failed to seed admin user:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seedAdmin()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { seedAdmin };
