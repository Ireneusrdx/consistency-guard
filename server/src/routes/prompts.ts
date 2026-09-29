import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { analyzePrompt, optimizePrompt } from '../engine/promptAnalysis';
import { createEvaluation, waitForEvaluation, getEvaluationResults } from '../engine/evaluation';
import { jsonStringify } from '../utils/json';

const router = Router();
router.use(requireAuth);

const promptSchema = z.object({
  prompt: z.string().trim().min(1, 'Prompt must not be empty.').max(20000),
});

/** POST /api/prompts/analyze */
router.post('/analyze', async (req: Request, res: Response) => {
  const parsed = promptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed.', details: parsed.error.flatten().fieldErrors });
  }
  const analysis = analyzePrompt(parsed.data.prompt);
  await prisma.promptAnalysis.create({
    data: {
      userId: req.user!.id,
      promptText: parsed.data.prompt,
      score: analysis.score,
      dimensions: jsonStringify(analysis.dimensions),
      issues: jsonStringify(analysis.issues),
      suggestions: jsonStringify(analysis.suggestions),
    },
  });
  return res.json(analysis);
});

/** POST /api/prompts/improve */
router.post('/improve', async (req: Request, res: Response) => {
  const parsed = promptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed.', details: parsed.error.flatten().fieldErrors });
  }
  const analysis = analyzePrompt(parsed.data.prompt);
  const optimized = optimizePrompt(parsed.data.prompt, analysis);
  return res.json({ original: parsed.data.prompt, optimized, analysis });
});

const compareSchema = z.object({
  original: z.string().trim().min(1).max(20000),
  optimized: z.string().trim().min(1).max(20000),
  modelKeys: z.array(z.string()).min(1).max(3).optional(),
  runs: z.number().int().min(1).max(5).optional(),
  domain: z.string().max(60).optional(),
});

const historySchema = z.object({
  original: z.string().trim().min(1).max(20000),
  improved: z.string().trim().min(1).max(20000),
  scoreBefore: z.number().min(0).max(100),
  scoreAfter: z.number().min(0).max(100),
});

/**
 * GET /api/prompts/history — the user's saved prompt improvement history,
 * most recent first.
 */
router.get('/history', async (req: Request, res: Response) => {
  const items = await prisma.promptHistory.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return res.json({
    items: items.map((h) => ({
      id: h.id,
      original: h.original,
      improved: h.improved,
      scoreBefore: h.scoreBefore,
      scoreAfter: h.scoreAfter,
      createdAt: h.createdAt.toISOString(),
    })),
  });
});

/**
 * POST /api/prompts/history — save an analyzed → improved prompt pair.
 */
router.post('/history', async (req: Request, res: Response) => {
  const parsed = historySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed.', details: parsed.error.flatten().fieldErrors });
  }
  const saved = await prisma.promptHistory.create({
    data: { userId: req.user!.id, ...parsed.data },
  });
  return res.status(201).json({
    id: saved.id,
    original: saved.original,
    improved: saved.improved,
    scoreBefore: saved.scoreBefore,
    scoreAfter: saved.scoreAfter,
    createdAt: saved.createdAt.toISOString(),
  });
});

/**
 * POST /api/prompts/compare — prompt playground: evaluates both prompts
 * (default 3 runs each) and compares reliability/consistency/relevance/
 * completeness/grounding computed from real engine output.
 */
router.post('/compare', async (req: Request, res: Response) => {
  const parsed = compareSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed.', details: parsed.error.flatten().fieldErrors });
  }
  const { original, optimized, domain } = parsed.data;
  const modelKeys = parsed.data.modelKeys ?? ['gpt-4o-mini', 'claude-3-5-haiku'];
  const runs = parsed.data.runs ?? 3;

  const summarize = async (prompt: string) => {
    const id = await createEvaluation({
      userId: req.user!.id,
      question: prompt,
      domain: domain ?? 'general',
      taskType: 'qa',
      evaluationMode: 'quick',
      modelKeys,
      runs,
      enableEvidence: true,
      enableUncertainty: true,
      enableConflicts: false,
    });
    await waitForEvaluation(id);
    const results = await getEvaluationResults(id);
    const metrics: Record<string, number> = {};
    for (const m of results?.models ?? []) {
      for (const [name, metric] of Object.entries(m.metrics)) {
        metrics[name] = (metrics[name] ?? 0) + (metric as { value: number }).value;
      }
    }
    const n = results?.models.length ?? 1;
    for (const k of Object.keys(metrics)) metrics[k] = Math.round(metrics[k] / n);
    return { evaluationId: id, metrics };
  };

  try {
    const [a, b] = await Promise.all([summarize(original), summarize(optimized)]);
    return res.json({ original: a, optimized: b });
  } catch (err) {
    // Never leak raw error text (provider/DB internals) to clients.
    console.error('[prompts] comparison failed:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Prompt comparison failed. Please try again.' });
  }
});

export default router;
