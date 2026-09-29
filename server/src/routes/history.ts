import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const querySchema = z.object({
  search: z.string().max(200).optional(),
  domain: z.string().max(60).optional(),
  model: z.string().max(80).optional(),
  taskType: z.string().max(60).optional(),
  status: z.enum(['pending', 'running', 'completed', 'partial', 'failed']).optional(),
  minReliability: z.coerce.number().min(0).max(100).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** GET /api/history — paginated, filterable evaluation history. */
router.get('/', async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query parameters.', details: parsed.error.flatten().fieldErrors });
  }
  const { search, domain, model, taskType, status, minReliability, from, to, page, pageSize } = parsed.data;

  const where: Record<string, unknown> = { userId: req.user!.id };
  if (domain) where.domain = domain;
  if (taskType) where.taskType = taskType;
  if (status) where.status = status;
  if (minReliability != null) where.avgReliability = { gte: minReliability };
  if (search) where.questionText = { contains: search };
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }
  if (model) {
    where.responses = { some: { modelKey: model } };
  }

  const [total, items] = await Promise.all([
    prisma.evaluation.count({ where: where as never }),
    prisma.evaluation.findMany({
      where: where as never,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        questionText: true,
        domain: true,
        taskType: true,
        evaluationMode: true,
        runs: true,
        status: true,
        avgReliability: true,
        avgConsistency: true,
        totalCostUsd: true,
        createdAt: true,
        responses: {
          distinct: ['modelKey'],
          select: { modelKey: true, providerId: true },
        },
        _count: { select: { conflicts: true } },
      },
    }),
  ]);

  return res.json({
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    items: items.map((e) => ({
      id: e.id,
      question: e.questionText.length > 140 ? e.questionText.slice(0, 140) + '…' : e.questionText,
      domain: e.domain,
      taskType: e.taskType,
      evaluationMode: e.evaluationMode,
      runs: e.runs,
      status: e.status,
      reliability: e.avgReliability,
      consistency: e.avgConsistency,
      conflicts: e._count.conflicts,
      models: e.responses.map((r) => ({ modelKey: r.modelKey, providerId: r.providerId })),
      totalCostUsd: e.totalCostUsd,
      createdAt: e.createdAt,
    })),
  });
});

export default router;
