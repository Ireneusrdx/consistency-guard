import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { ensureProviders } from './utils/ensureProviders';
import authRoutes from './routes/auth';
import providerRoutes from './routes/providers';
import evaluationRoutes from './routes/evaluations';
import promptRoutes from './routes/prompts';
import benchmarkRoutes from './routes/benchmarks';
import reportRoutes from './routes/reports';
import historyRoutes from './routes/history';
import adversarialRoutes from './routes/adversarial';
import settingsRoutes from './routes/settings';
import dashboardRoutes from './routes/dashboard';
import analyticsRoutes from './routes/analytics';

const app = express();
const PORT = parseInt(process.env.PORT ?? '4000', 10);
const isProduction = process.env.NODE_ENV === 'production';

// Behind a reverse proxy / hosting platform: correct client IPs for rate limiting.
app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:3000')
      .split(',')
      .map((s) => s.trim()),
    credentials: true,
  }),
);
app.use(express.json({ limit: '2mb' }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});
app.use('/api', apiLimiter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'consistency-guard', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/evaluations', evaluationRoutes);
app.use('/api/prompts', promptRoutes);
app.use('/api/benchmarks', benchmarkRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/adversarial', adversarialRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/analytics', analyticsRoutes);

// NOTE: generated report PDFs live under uploads/reports/ but are NEVER served
// statically — they go out exclusively through the authenticated
// GET /api/reports/:id?format=pdf route (ownership-checked). A static
// /uploads route here would bypass auth for anyone holding a report URL.

// Serve the built client in production (single-container deploys).
// CLIENT_DIST overrides the default ../.. /client/dist relative to server/dist.
const clientDist =
  process.env.CLIENT_DIST ?? path.join(__dirname, '..', '..', 'client', 'dist');
let servingClient = false;
try {
  const indexHtml = path.join(clientDist, 'index.html');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('fs').accessSync(indexHtml);
  app.use(express.static(clientDist, { maxAge: isProduction ? '1h' : 0 }));
  servingClient = true;
} catch {
  /* no client build present — API-only mode (local dev serves the client via Vite) */
}

app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'API route not found.' });
});

// SPA fallback — only when serving the client build, and never for /api/*.
if (servingClient) {
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Central error handler — meaningful messages, no secret leakage.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const statusCode =
    (err as { statusCode?: number }).statusCode ??
    (err as { status?: number }).status ??
    500;
  const message = err instanceof Error ? err.message : 'Internal server error.';
  if (statusCode >= 500) {
    console.error('[api] unhandled error:', message);
  }
  res.status(statusCode).json({
    error: statusCode >= 500 ? 'Internal server error. Please try again.' : message,
  });
});

async function main(): Promise<void> {
  if (!process.env.JWT_SECRET || !process.env.ENCRYPTION_KEY) {
    const message =
      'JWT_SECRET and ENCRYPTION_KEY must be set. Copy .env.example to .env and fill them in.';
    if (isProduction) {
      console.error(`[fatal] ${message}`);
      process.exit(1);
    }
    console.warn(`[warn] ${message}`);
  }
  await ensureProviders();
  app.listen(PORT, () => {
    console.log(`Consistency Guard API listening on http://localhost:${PORT}`);
    if (servingClient) console.log('Serving client build from', clientDist);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err instanceof Error ? err.message : err);
  process.exit(1);
});

export default app;
