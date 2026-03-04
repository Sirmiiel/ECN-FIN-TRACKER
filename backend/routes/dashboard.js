const express = require('express');
const { pool } = require('../config/database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// Get dashboard data for current user
router.get('/user', authMiddleware, async (req, res) => {
  try {
    const campaignStartDate = new Date(process.env.CAMPAIGN_START_DATE || '2025-02-10');
    const campaignDurationDays = parseInt(process.env.CAMPAIGN_DURATION_DAYS || 120);
    const campaignEndDate = new Date(campaignStartDate);
    campaignEndDate.setDate(campaignEndDate.getDate() + campaignDurationDays);
    
    const today = new Date();
    const daysElapsed = Math.floor((today - campaignStartDate) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, campaignDurationDays - daysElapsed);

    // Get user data
    const userResult = await pool.query(
      `SELECT id, name, unique_user_id, balance, target_amount, plan_type, plan_start_date
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    const user = userResult.rows[0];

    // Get payment stats
    const statsResult = await pool.query(
      `SELECT 
         COUNT(*) FILTER (WHERE status = 'verified') as verified_count,
         COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
         COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count,
         COALESCE(SUM(amount) FILTER (WHERE status = 'verified'), 0) as total_verified
       FROM payments WHERE user_id = $1`,
      [req.user.id]
    );

    const stats = statsResult.rows[0];

    // Calculate expected amount based on plan
    const planResult = await pool.query(
      'SELECT expected_amount, frequency FROM savings_plans WHERE plan_name = $1',
      [user.plan_type]
    );

    let expectedAmount = 0;
    if (planResult.rows.length > 0) {
      const plan = planResult.rows[0];
      if (plan.frequency === 'daily') {
        expectedAmount = plan.expected_amount * daysElapsed;
      } else if (plan.frequency === 'weekly') {
        const weeksElapsed = Math.floor(daysElapsed / 7);
        expectedAmount = plan.expected_amount * weeksElapsed;
      }
    }

    // Get recent payments
    const recentPaymentsResult = await pool.query(
      `SELECT payment_id, amount, payment_date, status
       FROM payments
       WHERE user_id = $1
       ORDER BY payment_date DESC
       LIMIT 5`,
      [req.user.id]
    );

    res.json({
      user: {
        name: user.name,
        uniqueUserId: user.unique_user_id,
        balance: parseFloat(user.balance),
        targetAmount: user.target_amount ? parseFloat(user.target_amount) : null,
        planType: user.plan_type,
        planStartDate: user.plan_start_date
      },
      campaign: {
        daysElapsed,
        daysRemaining,
        totalDays: campaignDurationDays,
        startDate: campaignStartDate,
        endDate: campaignEndDate
      },
      stats: {
        verifiedPayments: parseInt(stats.verified_count),
        pendingPayments: parseInt(stats.pending_count),
        rejectedPayments: parseInt(stats.rejected_count),
        totalVerified: parseFloat(stats.total_verified),
        expectedAmount: parseFloat(expectedAmount),
        progressPercentage: expectedAmount > 0 
          ? Math.min(100, (parseFloat(stats.total_verified) / expectedAmount) * 100)
          : 0
      },
      recentPayments: recentPaymentsResult.rows
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Get team overview (all users can see this)
router.get('/team', authMiddleware, async (req, res) => {
  const { sortBy = 'name', order = 'ASC', limit = 50, offset = 0 } = req.query;

  try {
    const validSortFields = ['name', 'balance', 'plan_type'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'name';
    const sortOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    // Get all users with their stats
    const result = await pool.query(
      `SELECT 
         u.id,
         u.name,
         u.unique_user_id,
         u.balance,
         u.target_amount,
         u.plan_type,
         COUNT(p.payment_id) FILTER (WHERE p.status = 'verified') as payment_count,
         COUNT(p.payment_id) FILTER (WHERE p.status = 'pending') as pending_count
       FROM users u
       LEFT JOIN payments p ON u.id = p.user_id
       WHERE u.is_active = true
       GROUP BY u.id
       ORDER BY ${sortField} ${sortOrder}
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM users WHERE is_active = true'
    );

    // Calculate team totals
    const totalsResult = await pool.query(
      `SELECT 
         COALESCE(SUM(balance), 0) as total_balance,
         COUNT(*) as total_members,
         COUNT(*) FILTER (WHERE plan_type = 'daily') as daily_plan_count,
         COUNT(*) FILTER (WHERE plan_type = 'weekly') as weekly_plan_count
       FROM users
       WHERE is_active = true`
    );

    const totals = totalsResult.rows[0];

    res.json({
      users: result.rows.map(user => ({
        id: user.id,
        name: user.name,
        uniqueUserId: user.unique_user_id,
        balance: parseFloat(user.balance),
        targetAmount: user.target_amount ? parseFloat(user.target_amount) : null,
        planType: user.plan_type,
        paymentCount: parseInt(user.payment_count),
        pendingCount: parseInt(user.pending_count),
        progressPercentage: user.target_amount 
          ? Math.min(100, (parseFloat(user.balance) / parseFloat(user.target_amount)) * 100)
          : null
      })),
      totals: {
        totalBalance: parseFloat(totals.total_balance),
        totalMembers: parseInt(totals.total_members),
        dailyPlanCount: parseInt(totals.daily_plan_count),
        weeklyPlanCount: parseInt(totals.weekly_plan_count)
      },
      pagination: {
        total: parseInt(countResult.rows[0].count),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Team overview error:', error);
    res.status(500).json({ error: 'Failed to fetch team overview' });
  }
});

// Get admin analytics (admin only)
router.get('/admin', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Payment status distribution
    const paymentStatsResult = await pool.query(
      `SELECT 
         status,
         COUNT(*) as count,
         COALESCE(SUM(amount), 0) as total_amount
       FROM payments
       GROUP BY status`
    );

    // Daily payment trends (last 30 days)
    const trendResult = await pool.query(
      `SELECT 
         DATE(payment_date) as date,
         COUNT(*) as payment_count,
         COALESCE(SUM(amount), 0) as total_amount
       FROM payments
       WHERE payment_date >= CURRENT_DATE - INTERVAL '30 days'
         AND status = 'verified'
       GROUP BY DATE(payment_date)
       ORDER BY date DESC`
    );

    // Top contributors
    const topContributorsResult = await pool.query(
      `SELECT 
         u.name,
         u.unique_user_id,
         u.balance,
         COUNT(p.payment_id) as payment_count
       FROM users u
       LEFT JOIN payments p ON u.id = p.user_id AND p.status = 'verified'
       WHERE u.is_active = true
       GROUP BY u.id, u.name, u.unique_user_id, u.balance
       ORDER BY u.balance DESC
       LIMIT 10`
    );

    // Users needing attention (pending payments > 24 hours)
    const attentionNeededResult = await pool.query(
      `SELECT 
         u.name,
         u.unique_user_id,
         COUNT(p.payment_id) as pending_count,
         MIN(p.payment_date) as oldest_pending
       FROM users u
       JOIN payments p ON u.id = p.user_id
       WHERE p.status = 'pending'
         AND p.payment_date < CURRENT_TIMESTAMP - INTERVAL '24 hours'
       GROUP BY u.id, u.name, u.unique_user_id
       ORDER BY oldest_pending ASC`
    );

    // Plan distribution and performance
    const planStatsResult = await pool.query(
      `SELECT 
         plan_type,
         COUNT(*) as member_count,
         COALESCE(AVG(balance), 0) as avg_balance,
         COALESCE(SUM(balance), 0) as total_balance
       FROM users
       WHERE is_active = true
       GROUP BY plan_type`
    );

    res.json({
      paymentStats: paymentStatsResult.rows.map(row => ({
        status: row.status,
        count: parseInt(row.count),
        totalAmount: parseFloat(row.total_amount)
      })),
      dailyTrends: trendResult.rows.map(row => ({
        date: row.date,
        paymentCount: parseInt(row.payment_count),
        totalAmount: parseFloat(row.total_amount)
      })),
      topContributors: topContributorsResult.rows.map(row => ({
        name: row.name,
        uniqueUserId: row.unique_user_id,
        balance: parseFloat(row.balance),
        paymentCount: parseInt(row.payment_count)
      })),
      attentionNeeded: attentionNeededResult.rows.map(row => ({
        name: row.name,
        uniqueUserId: row.unique_user_id,
        pendingCount: parseInt(row.pending_count),
        oldestPending: row.oldest_pending
      })),
      planStats: planStatsResult.rows.map(row => ({
        planType: row.plan_type,
        memberCount: parseInt(row.member_count),
        avgBalance: parseFloat(row.avg_balance),
        totalBalance: parseFloat(row.total_balance)
      }))
    });
  } catch (error) {
    console.error('Admin analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch admin analytics' });
  }
});

module.exports = router;
