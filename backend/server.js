const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
require('dotenv').config();

const logger = require('./config/logger');
const { pool } = require('./config/database');
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payments');
const userRoutes = require('./routes/users');
const dashboardRoutes = require('./routes/dashboard');
const { createBackup } = require('./scripts/backup');
const { runDailyJobs } = require('./scripts/dailyJobs');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || 900000), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || 100),
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy', 
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message
    });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack, path: req.path });

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: 'Invalid token' });
  }

  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Scheduled jobs
if (process.env.NODE_ENV !== 'test') {
  // Daily backup at 2 AM
  cron.schedule('0 2 * * *', async () => {
    logger.info('Running scheduled backup...');
    try {
      await createBackup();
      logger.info('Scheduled backup completed');
    } catch (error) {
      logger.error('Scheduled backup failed', { error: error.message });
    }
  });

  // Daily reconciliation at 3 AM
  cron.schedule('0 3 * * *', async () => {
    logger.info('Running daily reconciliation...');
    try {
      await runDailyJobs();
      logger.info('Daily jobs completed');
    } catch (error) {
      logger.error('Daily jobs failed', { error: error.message });
    }
  });

  logger.info('Scheduled jobs configured');
}

// Start server
app.listen(PORT, () => {
  logger.info(`ECN Tracker API running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

module.exports = app;
