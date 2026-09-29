import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const FINISHED = ['completed', 'partial'] as const;

/**
 * GET /api/analytics/model-trends?evaluationId=…
 * Per-model daily reliability trends, for the models in the given evaluation.
 * Only real stored metrics are returned — never fabricated.
 */
router.get('/model-trends', async (req: Request, res: Response) => {
  const evaluationId = String(req.query.evaluationId ?? '');
  if (!evaluationId) {
    return res.status(400).json({ error: 'evaluationId is required.' });
  }
  const evaluation = await prisma.evaluation.findFirst({
    where: { id: evaluationId, userId: req.user!.id },
    select: { id: true },
  });
  if (!evaluation) {
    return res.status(404).json({ error: 'Evaluation not found.' });
  }
  const keyRows = await prisma.metricResult.findMany({
    where: { evaluationId, metricName: 'reliability' },
    select: { modelKey: true },
    distinct: ['modelKey'],
  });
  const modelKeys = keyRows.map((r) => r.modelKey);
  if (modelKeys.length === 0) {
    return res.json({ trends: [] });
  }
  const rows = await prisma.metricResult.findMany({
    where: {
      metricName: 'reliability',
      modelKey: { in: modelKeys },
      evaluation: { userId: req.user!.id, status: { in: [...FINISHED] } },
    },
    include: { evaluation: { select: { createdAt: true } } },
    orderBy: { evaluation: { createdAt: 'asc' } },
    take: 2000,
  });

  // Average per (model, day), then keep the last 20 days per model.
  const byModelDay = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    const day = r.evaluation.createdAt.toISOString().slice(0, 10);
    const key = `${r.modelKey}|${day}`;
    const acc = byModelDay.get(key) ?? { sum: 0, n: 0 };
    acc.sum += r.value;
    acc.n += 1;
    byModelDay.set(key, acc);
  }
  const perModel = new Map<string, { date: string; reliability: number }[]>();
  for (const [key, acc] of byModelDay) {
    const [modelKey, day] = key.split('|');
    const list = perModel.get(modelKey) ?? [];
    list.push({ date: day, reliability: Math.round((acc.sum / acc.n) * 10) / 10 });
    perModel.set(modelKey, list);
  }
  const trends = [...perModel.entries()].map(([model, points]) => ({
    model,
    points: points
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(-20),
  }));
  return res.json({ trends });
});

/**
 * GET /api/analytics/model-domains
 * Average reliability per (model, domain) across the user's finished
 * evaluations. Only real stored metrics are returned.
 */
router.get('/model-domains', async (req: Request, res: Response) => {
  const rows = await prisma.metricResult.findMany({
    where: {
      metricName: 'reliability',
      evaluation: { userId: req.user!.id, status: { in: [...FINISHED] } },
    },
    include: { evaluation: { select: { domain: true } } },
    take: 5000,
  });
  const acc = new Map<string, { sum: number; n: number; domain: string; model: string }>();
  for (const r of rows) {
    const key = `${r.modelKey}|${r.evaluation.domain}`;
    const a = acc.get(key) ?? { sum: 0, n: 0, domain: r.evaluation.domain, model: r.modelKey };
    a.sum += r.value;
    a.n += 1;
    acc.set(key, a);
  }
  const points = [...acc.values()].map((a) => ({
    model: a.model,
    domain: a.domain,
    reliability: Math.round((a.sum / a.n) * 10) / 10,
  }));
  return res.json({ points });
});

export default router;
