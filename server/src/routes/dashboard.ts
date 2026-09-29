import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

/** GET /api/dashboard — aggregate analytics for the dashboard page. */
router.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const [
    totalEvaluations,
    completedEvaluations,
    totalConflicts,
    totalClaims,
    supportedClaims,
    totalReports,
    totalBenchmarkRuns,
    modelsUsed,
    recent,
    reliabilitySeries,
    domainStats,
  ] = await Promise.all([
    prisma.evaluation.count({ where: { userId } }),
    prisma.evaluation.findMany({
      where: { userId, status: { in: ['completed', 'partial'] } },
      select: { avgReliability: true, avgConsistency: true, totalCostUsd: true, totalLatencyMs: true },
    }),
    prisma.conflict.count({ where: { evaluation: { userId } } }),
    prisma.factClaim.count({ where: { evaluation: { userId } } }),
    prisma.factClaim.count({ where: { evaluation: { userId }, status: 'supported' } }),
    prisma.report.count({ where: { userId } }),
    prisma.benchmarkRun.count({ where: { benchmark: { OR: [{ userId }, { isCurated: true }] } } }),
    prisma.modelResponse.groupBy({ by: ['modelKey'], where: { evaluation: { userId } }, _count: { modelKey: true } }),
    prisma.evaluation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true, questionText: true, domain: true, status: true,
        avgReliability: true, avgConsistency: true, createdAt: true,
        responses: { distinct: ['modelKey'], select: { modelKey: true } },
      },
    }),
    prisma.evaluation.findMany({
      where: { userId, status: { in: ['completed', 'partial'] }, avgReliability: { not: null } },
      orderBy: { createdAt: 'asc' },
      take: 60,
      select: { avgReliability: true, avgConsistency: true, createdAt: true },
    }),
    prisma.evaluation.groupBy({
      by: ['domain'],
      where: { userId, status: { in: ['completed', 'partial'] }, avgReliability: { not: null } },
      _avg: { avgReliability: true, avgConsistency: true },
      _count: { domain: true },
    }),
  ]);

  const avg = (xs: Array<number | null | undefined>) => {
    const vals = xs.filter((x): x is number => typeof x === 'number');
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };

  return res.json({
    totals: {
      evaluations: totalEvaluations,
      modelsTested: modelsUsed.length,
      avgReliability: avg(completedEvaluations.map((e) => e.avgReliability)),
      avgConsistency: avg(completedEvaluations.map((e) => e.avgConsistency)),
      conflictsDetected: totalConflicts,
      claimsVerified: supportedClaims,
      claimsTotal: totalClaims,
      reportsGenerated: totalReports,
      benchmarkRuns: totalBenchmarkRuns,
      totalCostUsd: Math.round(completedEvaluations.reduce((a, e) => a + (e.totalCostUsd ?? 0), 0) * 1e6) / 1e6,
      avgLatencyMs: avg(completedEvaluations.map((e) => e.totalLatencyMs)),
    },
    reliabilityOverTime: reliabilitySeries.map((e) => ({
      date: e.createdAt.toISOString().slice(0, 10),
      reliability: e.avgReliability,
      consistency: e.avgConsistency,
    })),
    modelUsage: modelsUsed.map((m) => ({ modelKey: m.modelKey, evaluations: m._count.modelKey })),
    domainPerformance: domainStats.map((d) => ({
      domain: d.domain,
      avgReliability: d._avg.avgReliability != null ? Math.round(d._avg.avgReliability) : null,
      avgConsistency: d._avg.avgConsistency != null ? Math.round(d._avg.avgConsistency) : null,
      evaluations: d._count.domain,
    })),
    recentEvaluations: recent.map((e) => ({
      id: e.id,
      question: e.questionText.length > 120 ? e.questionText.slice(0, 120) + '…' : e.questionText,
      domain: e.domain,
      status: e.status,
      reliability: e.avgReliability,
      consistency: e.avgConsistency,
      models: e.responses.map((r) => r.modelKey),
      createdAt: e.createdAt,
    })),
  });
});

export default router;
