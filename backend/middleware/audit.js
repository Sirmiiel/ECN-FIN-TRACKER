const { pool } = require('../config/database');

const logAction = async (action, userId, entityType, entityId, details, ipAddress) => {
  try {
    await pool.query(
      `INSERT INTO audit_log (action, user_id, entity_type, entity_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [action, userId, entityType, entityId, JSON.stringify(details), ipAddress]
    );
  } catch (error) {
    console.error('Audit log error:', error);
    // Don't throw - audit logging should not break the main flow
  }
};

const auditMiddleware = (action) => {
  return (req, res, next) => {
    const originalJson = res.json;
    
    res.json = function(data) {
      // Log after successful response
      if (res.statusCode < 400) {
        const details = {
          method: req.method,
          path: req.path,
          body: req.body,
          query: req.query,
          params: req.params
        };
        
        logAction(
          action,
          req.user?.id,
          req.params.entityType,
          req.params.id,
          details,
          req.ip
        ).catch(err => console.error('Audit log failed:', err));
      }
      
      return originalJson.call(this, data);
    };
    
    next();
  };
};

module.exports = { logAction, auditMiddleware };
