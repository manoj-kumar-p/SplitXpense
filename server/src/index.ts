import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import {authRouter} from './routes/auth';
import {aaRouter} from './routes/aa';
import {transactionsRouter} from './routes/transactions';
import {webhookRouter} from './routes/webhook';
import {backupRouter} from './routes/backup';
import {initFCM} from './services/pushNotification';
import {initDB, initTables, getPool} from './db/postgres';
import {initRedis, getRedis} from './db/redis';
import {startScheduler, stopScheduler} from './services/scheduler';
import {authMiddleware} from './middleware/auth';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));

// Health check (unauthenticated)
app.get('/health', (_req, res) => {
  res.json({status: 'ok', timestamp: new Date().toISOString()});
});

// Routes
// Auth: register is unauthenticated; refresh-fcm has its own authMiddleware
app.use('/api/auth', authRouter);
// Webhooks are called by Setu AA servers (unauthenticated, verified via signature)
app.use('/api/webhook', webhookRouter);
// AA and transactions routes require authentication
app.use('/api/aa', authMiddleware, aaRouter);
app.use('/api/transactions', authMiddleware, transactionsRouter);
app.use('/api/backup', authMiddleware, backupRouter);

async function main() {
  // Initialize PostgreSQL connection pool and create tables
  initDB();
  await initTables();
  console.log('PostgreSQL initialized');

  // Initialize Redis
  await initRedis();
  console.log('Redis initialized');

  // Initialize Firebase Cloud Messaging
  try {
    initFCM();
    console.log('Firebase Cloud Messaging initialized');
  } catch (err) {
    console.warn(
      'FCM initialization skipped (no service account configured):',
      (err as Error).message,
    );
  }

  // Start AA consent polling scheduler (every 15 minutes)
  startScheduler(15);

  const server = app.listen(PORT, () => {
    console.log(`SplitXpense server running on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);

    stopScheduler();
    console.log('Scheduler stopped');

    server.close(() => {
      console.log('HTTP server closed');
    });

    try {
      await getPool().end();
      console.log('PostgreSQL pool closed');
    } catch (err) {
      console.error('Error closing PostgreSQL pool:', err);
    }

    try {
      await getRedis().quit();
      console.log('Redis client closed');
    } catch (err) {
      console.error('Error closing Redis client:', err);
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(console.error);

export default app;
