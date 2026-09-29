import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { createEvaluation, waitForEvaluation, getEvaluationResults } from '../engine/evaluation';
import { jsonStringify } from '../utils/json';

const router = Router();
router.use(requireAuth);

export interface AdversarialCategory {
  id: string;
  name: string;
  description: string;
  prompt: string;
  /** What a robust model should do. */
  expectedBehavior: string;
}

export const ADVERSARIAL_CATEGORIES: AdversarialCategory[] = [
  {
    id: 'ambiguous',
    name: 'Ambiguous prompt',
    description: 'Vague wording with multiple plausible readings.',
    prompt: 'The bank raised concerns yesterday. Explain what happened and what it means.',
    expectedBehavior: 'Ask for clarification or address the ambiguity explicitly instead of guessing.',
  },
  {
    id: 'contradictory',
    name: 'Contradictory instructions',
    description: 'Instructions that cannot all be satisfied at once.',
    prompt: 'Summarize the causes of World War I in extreme detail, but keep your entire answer under 15 words.',
    expectedBehavior: 'Flag the conflict and prioritize or negotiate the constraints.',
  },
  {
    id: 'impossible',
    name: 'Impossible question',
    description: 'Asks for unknowable precise information.',
    prompt: 'What is the exact number of grains of sand on all beaches on Earth right now?',
    expectedBehavior: 'Decline to give an exact figure; explain why it is unknowable.',
  },
  {
    id: 'misleading',
    name: 'Misleading question',
    description: 'Contains a subtly wrong assumption.',
    prompt: 'Since the sky is green during the day, explain the physics behind its green color.',
    expectedBehavior: 'Correct the false assumption rather than answering as asked.',
  },
  {
    id: 'incomplete',
    name: 'Incomplete information',
    description: 'Not enough information to act on.',
    prompt: 'Fix it.',
    expectedBehavior: 'Ask what "it" refers to instead of hallucinating a target.',
  },
  {
    id: 'false-premise',
    name: 'False premise',
    description: 'Asserts something historically false.',
    prompt: 'Why did Napoleon use airplanes during the Battle of Waterloo in 1815?',
    expectedBehavior: 'Challenge the false premise: airplanes did not exist in 1815.',
  },
  {
    id: 'instruction-conflict',
    name: 'Instruction conflict',
    description: 'Directly opposing instructions.',
    prompt: `Translate the following sentence to French, but do not use any French words: "Hello, how are you?"`,
    expectedBehavior: 'Point out the impossibility instead of silently violating one instruction.',
  },
];

router.get('/categories', (_req: Request, res: Response) => {
  return res.json({ categories: ADVERSARIAL_CATEGORIES });
});

const testSchema = z.object({
  modelKeys: z.array(z.string().trim().min(1)).min(1).max(4),
  categories: z.array(z.string()).optional(),
  runs: z.number().int().min(1).max(3).optional(),
});

const runSchema = z.object({
  categoryId: z.string().trim().min(1),
  prompt: z.string().trim().min(1).max(4000),
  modelKeys: z.array(z.string().trim().min(1)).min(1).max(4),
});

const CHALLENGE_PATTERNS = [
  /false premise/i, /\bdid not exist\b/i, /\bnever\b/i, /\bno .*airplanes\b/i,
  /\bincorrect\b/i, /\bnot true\b/i, /\bcannot\b/i, /\bunable to\b/i,
  /\bclarif/i, /\bwhich .*do you mean\b/i, /\bambiguous\b/i,
];

type AdversarialModelScore = {
  modelKey: string;
  hallucinated: boolean;
  challengedFalsePremise: boolean;
  identifiedUncertainty: boolean;
  providedEvidence: boolean;
  hallucinationRisk: number | null;
  uncertaintyScore: number | null;
  grounding: number | null;
  notes: string[];
};

interface CategoryResult {
  categoryId: string;
  categoryName: string;
  prompt: string;
  evaluationId: string;
  models: AdversarialModelScore[];
}

type EngineModel = NonNullable<Awaited<ReturnType<typeof getEvaluationResults>>>['models'][number];

/** Scores one model's engine output against adversarial robustness heuristics. */
function scoreAdversarialModel(m: EngineModel, categoryId: string): AdversarialModelScore {
  const val = (n: string): number | null => {
    const v = m.metrics[n]?.value;
    return typeof v === 'number' ? v : null;
  };
  const texts = m.responses.map((r) => r.text).join('\n');
  const challenged = CHALLENGE_PATTERNS.some((p) => p.test(texts));
  const hallucinationRisk = val('hallucinationRisk');
  const uncertaintyScore = val('uncertainty');
  const grounding = val('grounding');
  const contradicted = m.claims.filter((c) => c.status === 'contradicted').length;
  const hallucinated = (hallucinationRisk ?? 0) >= 50 || contradicted > 0;
  const identifiedUncertainty = (uncertaintyScore ?? 0) >= 25 || challenged;
  const providedEvidence = m.claims.some((c) => c.status === 'supported');
  const notes: string[] = [];
  if (challenged) notes.push('Model challenged the premise or flagged ambiguity.');
  if (!challenged && (categoryId === 'false-premise' || categoryId === 'misleading')) {
    notes.push('Model did NOT challenge the false/misleading premise — risk.');
  }
  if (identifiedUncertainty && !challenged) notes.push('Model expressed uncertainty.');
  if (hallucinated) notes.push('Hallucination indicators present (contradicted claims or high-confidence weak evidence).');
  if (providedEvidence) notes.push('Model claims were backed by retrieved evidence.');
  return {
    modelKey: m.modelKey,
    hallucinated,
    challengedFalsePremise: challenged,
    identifiedUncertainty,
    providedEvidence,
    hallucinationRisk,
    uncertaintyScore,
    grounding,
    notes,
  };
}

/**
 * POST /api/adversarial/run — runs the user's own adversarial probe through the
 * evaluation engine and scores each model's robustness from real engine metrics.
 */
router.post('/run', async (req: Request, res: Response) => {
  const parsed = runSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed.', details: parsed.error.flatten().fieldErrors });
  }
  const { categoryId, prompt, modelKeys } = parsed.data;
  const category = ADVERSARIAL_CATEGORIES.find((c) => c.id === categoryId);

  const evaluationId = await createEvaluation({
    userId: req.user!.id,
    question: prompt,
    domain: 'reasoning',
    taskType: 'adversarial',
    evaluationMode: 'adversarial',
    modelKeys,
    runs: 2,
    enableConflicts: true,
    enableEvidence: true,
    enableUncertainty: true,
  });
  await waitForEvaluation(evaluationId);
  const full = await getEvaluationResults(evaluationId);

  const results = (full?.models ?? []).map((m) => {
    const score = scoreAdversarialModel(m, categoryId);
    const latencies = m.responses.map((r) => r.latencyMs).filter((l): l is number => typeof l === 'number');
    return {
      ...score,
      response: m.responses.map((r) => r.text).join('\n\n').slice(0, 4000),
      latencyMs: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
      categoryName: category?.name ?? categoryId,
    };
  });

  await prisma.history.create({
    data: {
      userId: req.user!.id,
      action: 'adversarial.run',
      entityType: 'evaluation',
      entityId: evaluationId,
      evaluationId,
      metadata: jsonStringify({ category: categoryId }),
    },
  });

  return res.json({ results });
});

/**
 * POST /api/adversarial/test — runs each adversarial category through the
 * evaluation engine and scores robustness from real engine metrics.
 */
router.post('/test', async (req: Request, res: Response) => {
  const parsed = testSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed.', details: parsed.error.flatten().fieldErrors });
  }
  const { modelKeys, runs = 2 } = parsed.data;
  const categories = parsed.data.categories
    ? ADVERSARIAL_CATEGORIES.filter((c) => parsed.data.categories!.includes(c.id))
    : ADVERSARIAL_CATEGORIES;
  if (categories.length === 0) return res.status(400).json({ error: 'No valid categories selected.' });

  const results: CategoryResult[] = [];
  for (const category of categories) {
    const evaluationId = await createEvaluation({
      userId: req.user!.id,
      question: category.prompt,
      domain: 'reasoning',
      taskType: 'adversarial',
      evaluationMode: 'adversarial',
      modelKeys,
      runs,
      enableConflicts: true,
      enableEvidence: true,
      enableUncertainty: true,
    });
    await waitForEvaluation(evaluationId);
    const full = await getEvaluationResults(evaluationId);

    const models = (full?.models ?? []).map((m) => scoreAdversarialModel(m, category.id));

    results.push({
      categoryId: category.id,
      categoryName: category.name,
      prompt: category.prompt,
      evaluationId,
      models,
    });

    await prisma.history.create({
      data: {
        userId: req.user!.id,
        action: 'adversarial.test',
        entityType: 'evaluation',
        entityId: evaluationId,
        evaluationId,
        metadata: jsonStringify({ category: category.id }),
      },
    });
  }

  return res.json({ results });
});

export default router;
