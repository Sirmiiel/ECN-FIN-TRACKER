const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { logAction } = require('../middleware/audit');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// Get all users (admin can see all, members see public info)
router.get('/', authMiddleware, async (req, res) => {
  const { limit = 50, offset = 0, search, planType } = req.query;

  try {
    let query = `
      SELECT id, name, unique_user_id, role, plan_type, balance, 
             target_amount, plan_start_date, is_active, created_at
      FROM users
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (name ILIKE $${params.length} OR unique_user_id ILIKE $${params.length})`;
    }

    if (planType) {
      params.push(planType);
      query += ` AND plan_type = $${params.length}`;
    }

    query += ` ORDER BY name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM users WHERE 1=1';
    const countParams = [];
    if (search) {
      countParams.push(`%${search}%`);
      countQuery += ` AND (name ILIKE $${countParams.length} OR unique_user_id ILIKE $${countParams.length})`;
    }
    if (planType) {
      countParams.push(planType);
      countQuery += ` AND plan_type = $${countParams.length}`;
    }

    const countResult = await pool.query(countQuery, countParams);

    res.json({
      users: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Users fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get user by ID
router.get('/:userId', authMiddleware, async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      `SELECT id, name, unique_user_id, role, plan_type, balance, 
              target_amount, plan_start_date, is_active, created_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('User fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Update user (admin only or self for limited fields)
router.put('/:userId',
  authMiddleware,
  [
    body('name').optional().trim().notEmpty(),
    body('targetAmount').optional().isDecimal(),
    body('isActive').optional().isBoolean(),
    body('role').optional().isIn(['admin', 'member'])
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId } = req.params;
    const { name, targetAmount, isActive, role } = req.body;

    // Check authorization
    const isSelf = parseInt(userId) === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Only admin can change role and isActive
    if ((role || isActive !== undefined) && !isAdmin) {
      return res.status(403).json({ error: 'Admin access required for this operation' });
    }

    try {
      const updates = [];
      const params = [];

      if (name) {
        params.push(name);
        updates.push(`name = $${params.length}`);
      }

      if (targetAmount !== undefined) {
        params.push(targetAmount);
        updates.push(`target_amount = $${params.length}`);
      }

      if (isActive !== undefined && isAdmin) {
        params.push(isActive);
        updates.push(`is_active = $${params.length}`);
      }

      if (role && isAdmin) {
        params.push(role);
        updates.push(`role = $${params.length}`);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No valid updates provided' });
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(userId);

      const query = `
        UPDATE users 
        SET ${updates.join(', ')}
        WHERE id = $${params.length}
        RETURNING id, name, unique_user_id, role, plan_type, balance, 
                  target_amount, is_active, updated_at
      `;

      const result = await pool.query(query, params);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      await logAction('USER_UPDATED', req.user.id, 'user', userId, 
        { name, targetAmount, isActive, role }, req.ip);

      res.json({
        message: 'User updated successfully',
        user: result.rows[0]
      });
    } catch (error) {
      console.error('User update error:', error);
      res.status(500).json({ error: 'Failed to update user' });
    }
  }
);

// Request plan change
router.post('/:userId/plan-change-request',
  authMiddleware,
  [
    body('requestedPlan').isIn(['daily', 'weekly']).withMessage('Invalid plan type'),
    body('reason').optional().trim()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId } = req.params;
    const { requestedPlan, reason } = req.body;

    // User can only request for themselves
    if (parseInt(userId) !== req.user.id) {
      return res.status(403).json({ error: 'Can only request plan change for yourself' });
    }

    try {
      // Get current plan
      const userResult = await pool.query(
        'SELECT plan_type FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const currentPlan = userResult.rows[0].plan_type;

      if (currentPlan === requestedPlan) {
        return res.status(400).json({ error: 'Requested plan is same as current plan' });
      }

      // Check for existing pending request
      const existingRequest = await pool.query(
        'SELECT request_id FROM plan_change_requests WHERE user_id = $1 AND status = $2',
        [userId, 'pending']
      );

      if (existingRequest.rows.length > 0) {
        return res.status(409).json({ error: 'You already have a pending plan change request' });
      }

      // Create request
      const result = await pool.query(
        `INSERT INTO plan_change_requests (user_id, current_plan, requested_plan, reason)
         VALUES ($1, $2, $3, $4)
         RETURNING request_id, user_id, current_plan, requested_plan, status, created_at`,
        [userId, currentPlan, requestedPlan, reason]
      );

      await logAction('PLAN_CHANGE_REQUESTED', userId, 'plan_change', result.rows[0].request_id,
        { currentPlan, requestedPlan, reason }, req.ip);

      res.status(201).json({
        message: 'Plan change request submitted successfully',
        request: result.rows[0]
      });
    } catch (error) {
      console.error('Plan change request error:', error);
      res.status(500).json({ error: 'Failed to submit plan change request' });
    }
  }
);

// Get plan change requests (admin sees all, users see their own)
router.get('/plan-change-requests/list', authMiddleware, async (req, res) => {
  try {
    let query = `
      SELECT pcr.request_id, pcr.user_id, pcr.current_plan, pcr.requested_plan,
             pcr.status, pcr.reason, pcr.created_at, pcr.reviewed_at,
             u.name as user_name, u.unique_user_id,
             r.name as reviewed_by_name
      FROM plan_change_requests pcr
      JOIN users u ON pcr.user_id = u.id
      LEFT JOIN users r ON pcr.reviewed_by = r.id
    `;

    const params = [];
    if (req.user.role !== 'admin') {
      params.push(req.user.id);
      query += ` WHERE pcr.user_id = $${params.length}`;
    }

    query += ' ORDER BY pcr.created_at DESC';

    const result = await pool.query(query, params);

    res.json({ requests: result.rows });
  } catch (error) {
    console.error('Plan change requests fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch plan change requests' });
  }
});

// Review plan change request (admin only)
router.put('/plan-change-requests/:requestId',
  authMiddleware,
  adminMiddleware,
  [
    body('status').isIn(['approved', 'rejected']).withMessage('Invalid status')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { requestId } = req.params;
    const { status } = req.body;

    try {
      // Get request details
      const requestResult = await pool.query(
        'SELECT * FROM plan_change_requests WHERE request_id = $1 AND status = $2',
        [requestId, 'pending']
      );

      if (requestResult.rows.length === 0) {
        return res.status(404).json({ error: 'Request not found or already processed' });
      }

      const request = requestResult.rows[0];

      // Update request status
      await pool.query(
        `UPDATE plan_change_requests
         SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP
         WHERE request_id = $3`,
        [status, req.user.id, requestId]
      );

      // If approved, update user's plan
      if (status === 'approved') {
        await pool.query(
          `UPDATE users
           SET plan_type = $1, plan_start_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [request.requested_plan, request.user_id]
        );
      }

      await logAction('PLAN_CHANGE_REVIEWED', req.user.id, 'plan_change', requestId,
        { status, userId: request.user_id, newPlan: request.requested_plan }, req.ip);

      res.json({
        message: `Plan change request ${status}`,
        requestId
      });
    } catch (error) {
      console.error('Plan change review error:', error);
      res.status(500).json({ error: 'Failed to review plan change request' });
    }
  }
);

module.exports = router;
