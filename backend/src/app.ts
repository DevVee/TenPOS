import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env';
import { apiLimiter } from './middleware/rateLimit';
import { errorHandler, notFound } from './middleware/errorHandler';

import authRoutes from './routes/auth';
import productRoutes from './routes/products';
import inventoryRoutes from './routes/inventory';
import transactionRoutes from './routes/transactions';
import reportRoutes from './routes/reports';
import staffRoutes from './routes/staff';
import branchRoutes from './routes/branches';
import voucherRoutes from './routes/vouchers';
import auditRoutes from './routes/audit';

const app = express();

// ─── Security headers ───────────────────────────────────────────
app.use(helmet());

// ─── CORS ───────────────────────────────────────────────────────
app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Body parsing ────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// ─── Trust proxy (for correct IP behind Nginx) ───────────────────
app.set('trust proxy', 1);

// ─── Global rate limit ───────────────────────────────────────────
app.use('/api', apiLimiter);

// ─── Health check ────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ──────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/audit', auditRoutes);

// ─── 404 + Error handler ──────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;
