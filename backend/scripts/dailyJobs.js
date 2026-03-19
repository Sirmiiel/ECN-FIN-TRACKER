const { pool } = require('../config/database');

async function reconcileBalances() {
  console.log('Starting balance reconciliation...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get all active users
    const usersResult = await client.query(
      'SELECT id, balance FROM users WHERE is_active = true'
    );

    let discrepancies = 0;
    let corrected = 0;

    for (const user of usersResult.rows) {
      // Calculate balance from verified payments
      const paymentsResult = await client.query(
        'SELECT COALESCE(SUM(amount), 0) as calculated_balance FROM payments WHERE user_id = $1 AND status = $2',
        [user.id, 'verified']
      );

      const calculatedBalance = parseFloat(paymentsResult.rows[0].calculated_balance);
      const currentBalance = parseFloat(user.balance);

      if (Math.abs(calculatedBalance - currentBalance) > 0.01) {
        discrepancies++;
        console.log(`Discrepancy found for user ${user.id}: Current=${currentBalance}, Calculated=${calculatedBalance}`);

        // Update to correct balance
        await client.query(
          'UPDATE users SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [calculatedBalance, user.id]
        );

        corrected++;
        console.log(`Corrected balance for user ${user.id}`);
      }

      // Create balance snapshot
      await client.query(
        `INSERT INTO balance_snapshots (user_id, balance, snapshot_date)
         VALUES ($1, $2, CURRENT_DATE)
         ON CONFLICT (user_id, snapshot_date) 
         DO UPDATE SET balance = $2`,
        [user.id, calculatedBalance]
      );
    }

    await client.query('COMMIT');

    console.log(`Reconciliation complete. Discrepancies: ${discrepancies}, Corrected: ${corrected}`);
    return { discrepancies, corrected };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Reconciliation failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function notifyLongPendingPayments() {
  console.log('Checking for long pending payments...');

  try {
    const result = await pool.query(
      `SELECT 
         p.payment_id,
         p.amount,
         p.payment_date,
         u.name,
         u.unique_user_id
       FROM payments p
       JOIN users u ON p.user_id = u.id
       WHERE p.status = 'pending'
         AND p.payment_date < CURRENT_TIMESTAMP - INTERVAL '24 hours'
       ORDER BY p.payment_date ASC`
    );

    if (result.rows.length > 0) {
      console.log(`Found ${result.rows.length} payments pending for more than 24 hours:`);
      result.rows.forEach(payment => {
        console.log(`  - User: ${payment.name} (${payment.unique_user_id}), Amount: ${payment.amount}, Date: ${payment.payment_date}`);
      });
      
      // In production, send email/notification to admin
      return result.rows;
    } else {
      console.log('No long pending payments found');
      return [];
    }
  } catch (error) {
    console.error('Pending payment check failed:', error);
    throw error;
  }
}

async function generateDailySummary() {
  console.log('Generating daily summary...');

  try {
    const summary = await pool.query(
      `SELECT 
         COUNT(DISTINCT user_id) as active_users,
         COUNT(*) FILTER (WHERE status = 'verified') as verified_payments,
         COUNT(*) FILTER (WHERE status = 'pending') as pending_payments,
         COUNT(*) FILTER (WHERE status = 'rejected') as rejected_payments,
         COALESCE(SUM(amount) FILTER (WHERE status = 'verified'), 0) as total_verified_amount,
         COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) as total_pending_amount
       FROM payments
       WHERE DATE(payment_date) = CURRENT_DATE`
    );

    const dailyStats = summary.rows[0];
    console.log('Daily Summary:', dailyStats);
    
    return dailyStats;
  } catch (error) {
    console.error('Daily summary generation failed:', error);
    throw error;
  }
}

async function runDailyJobs() {
  console.log('=== Starting Daily Jobs ===');
  console.log(`Time: ${new Date().toISOString()}`);

  try {
    // Reconcile balances
    await reconcileBalances();

    // Check for long pending payments
    await notifyLongPendingPayments();

    // Generate daily summary
    await generateDailySummary();

    console.log('=== Daily Jobs Completed Successfully ===');
  } catch (error) {
    console.error('Daily jobs failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runDailyJobs()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { reconcileBalances, notifyLongPendingPayments, generateDailySummary, runDailyJobs };
