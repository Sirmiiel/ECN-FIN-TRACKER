const { pool } = require('../config/database');

const createTables = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        unique_user_id VARCHAR(50) UNIQUE NOT NULL,
        pin_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('admin', 'member')),
        plan_type VARCHAR(20) DEFAULT 'daily' CHECK (plan_type IN ('daily', 'weekly')),
        plan_start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        balance DECIMAL(12, 2) DEFAULT 0.00,
        target_amount DECIMAL(12, 2),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Payments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        payment_id UUID PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
        payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
        payment_method VARCHAR(50),
        verification_notes TEXT,
        verified_by INTEGER REFERENCES users(id),
        verified_at TIMESTAMP,
        idempotency_key VARCHAR(255) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Plans table
    await client.query(`
      CREATE TABLE IF NOT EXISTS savings_plans (
        plan_id SERIAL PRIMARY KEY,
        plan_name VARCHAR(50) UNIQUE NOT NULL,
        expected_amount DECIMAL(12, 2) NOT NULL,
        frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('daily', 'weekly')),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Audit log table
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        log_id SERIAL PRIMARY KEY,
        action VARCHAR(100) NOT NULL,
        user_id INTEGER REFERENCES users(id),
        entity_type VARCHAR(50),
        entity_id VARCHAR(255),
        details JSONB,
        ip_address VARCHAR(45),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Balance snapshots for reconciliation
    await client.query(`
      CREATE TABLE IF NOT EXISTS balance_snapshots (
        snapshot_id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        balance DECIMAL(12, 2) NOT NULL,
        snapshot_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, snapshot_date)
      )
    `);

    // Plan change requests
    await client.query(`
      CREATE TABLE IF NOT EXISTS plan_change_requests (
        request_id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        current_plan VARCHAR(20) NOT NULL,
        requested_plan VARCHAR(20) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        reason TEXT,
        reviewed_by INTEGER REFERENCES users(id),
        reviewed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    await client.query('CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_log(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_unique_id ON users(unique_user_id)');

    // Insert default savings plans
    await client.query(`
      INSERT INTO savings_plans (plan_name, expected_amount, frequency, description)
      VALUES 
        ('daily', 100.00, 'daily', 'Daily savings plan - contribute every day'),
        ('weekly', 700.00, 'weekly', 'Weekly savings plan - contribute every week')
      ON CONFLICT (plan_name) DO NOTHING
    `);

    await client.query('COMMIT');
    console.log('Database tables created successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating tables:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Run migration
if (require.main === module) {
  createTables()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { createTables };
