import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import {
  createEvaluation,
  getEvaluationStatus,
  getEvaluationResults,
  waitForEvaluation,
  EvaluationMode,
} from '../engine/evaluation';
import { DEFAULT_WEIGHTS } from '../engine/scoring';
import { jsonParse } from '../utils/json';

const router = Router();
router.use(requireAuth);

const weightsSchema = z.object({
  accuracy: z.number().min(0).max(1).optional(),
  consistency: z.number().min(0).max(1).optional(),
  relevance: z.number().min(0).max(1).optional(),
  completeness: z.number().min(0).max(1).optional(),
  grounding: z.number().min(0).max(1).optional(),
  instructionFollowing: z.number().min(0).max(1).optional(),
}).optional();

const createEvaluationSchema = z.object({
  question: z.string().trim().min(1, 'Prompt must not be empty.').max(20000),
  domain: z.string().trim().max(60).optional(),
  taskType: z.string().trim().max(60).optional(),
  evaluationMode: z.enum(['quick', 'consistency', 'deep', 'adversarial']).optional(),
  modelKeys: z.array(z.string().trim().min(1)).min(1, 'Select at least one model.').max(6),
  runs: z.number().int().min(1).max(10).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(16).max(8192).optional(),
  systemInstructions: z.string().max(5000).optional(),
  referenceAnswer: z.string().max(20000).optional(),
  enableEvidence: z.boolean().optional(),
  enableUncertainty: z.boolean().optional(),
  enableConflicts: z.boolean().optional(),
  weights: weightsSchema,
});

async function ownsEvaluation(userId: string, evaluationId: string) {
  return prisma.evaluation.findFirst({ where: { id: evaluationId, userId } });
}

/** POST /api/evaluations — create + kick off background execution. */
router.post('/', async (req: Request, res: Response) => {
  const parsed = createEvaluationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed.', details: parsed.error.flatten().fieldErrors });
  }
  try {
    const id = await createEvaluation({ ...parsed.data, userId: req.user!.id } as Parameters<typeof createEvaluation>[0]);
    return res.status(202).json({ id, status: 'pending', message: 'Evaluation started. Poll /status for progress.' });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 400;
    return res.status(statusCode).json({ error: err instanceof Error ? err.message : 'Could not start evaluation.' });
  }
});

/** GET /api/evaluations/:id/status — polling-friendly progress. */
router.get('/:id/status', async (req: Request, res: Response) => {
  const owned = await ownsEvaluation(req.user!.id, req.params.id);
  if (!owned) return res.status(404).json({ error: 'Evaluation not found.' });
  const status = await getEvaluationStatus(req.params.id);
  return res.json(status);
});

/** GET /api/evaluations/:id/results — full results dashboard payload. */
router.get('/:id/results', async (req: Request, res: Response) => {
  const owned = await ownsEvaluation(req.user!.id, req.params.id);
  if (!owned) return res.status(404).json({ error: 'Evaluation not found.' });
  const results = await getEvaluationResults(req.params.id);
  return res.json(results);
});

/** GET /api/evaluations/:id — summary. */
router.get('/:id', async (req: Request, res: Response) => {
  const evaluation = await ownsEvaluation(req.user!.id, req.params.id);
  if (!evaluation) return res.status(404).json({ error: 'Evaluation not found.' });
  return res.json({
    id: evaluation.id,
    question: evaluation.questionText,
    domain: evaluation.domain,
    taskType: evaluation.taskType,
    evaluationMode: evaluation.evaluationMode,
    runs: evaluation.runs,
    status: evaluation.status,
    statusMessage: evaluation.statusMessage,
    avgReliability: evaluation.avgReliability,
    avgConsistency: evaluation.avgConsistency,
    totalCostUsd: evaluation.totalCostUsd,
    totalLatencyMs: evaluation.totalLatencyMs,
    createdAt: evaluation.createdAt,
  });
});

/** POST /api/evaluations/:id/rerun — "Run Again" with identical parameters. */
router.post('/:id/rerun', async (req: Request, res: Response) => {
  const original = await ownsEvaluation(req.user!.id, req.params.id);
  if (!original) return res.status(404).json({ error: 'Evaluation not found.' });
  const runs = await prisma.evaluationRun.findMany({
    where: { evaluationId: original.id },
    distinct: ['modelKey'],
    select: { modelKey: true },
  });
  const question = await prisma.question.findUnique({ where: { id: original.questionId ?? '' } });
  const id = await createEvaluation({
    userId: req.user!.id,
    question: original.questionText,
    domain: original.domain,
    taskType: original.taskType,
    evaluationMode: original.evaluationMode as EvaluationMode,
    modelKeys: runs.map((r) => r.modelKey),
    runs: original.runs,
    systemInstructions: question?.systemInstructions ?? undefined,
    referenceAnswer: question?.referenceAnswer ?? undefined,
    weights: jsonParse<Record<string, number> | null>(original.weights, null) ?? DEFAULT_WEIGHTS,
  });
  return res.status(202).json({ id, status: 'pending' });
});

router.delete('/:id', async (req: Request, res: Response) => {
  const owned = await ownsEvaluation(req.user!.id, req.params.id);
  if (!owned) return res.status(404).json({ error: 'Evaluation not found.' });
  await prisma.evaluation.delete({ where: { id: req.params.id } });
  return res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Prompt intelligence
// ---------------------------------------------------------------------------

export default router;
