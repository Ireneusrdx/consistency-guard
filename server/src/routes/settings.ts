import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { normalizeWeights, DEFAULT_WEIGHTS } from '../engine/scoring';
import { jsonStringify, jsonParse } from '../utils/json';

const router = Router();
router.use(requireAuth);

const preferencesSchema = z.object({
  defaultRuns: z.number().int().min(1).max(10).optional(),
  defaultEvaluationMode: z.enum(['quick', 'consistency', 'deep', 'adversarial']).optional(),
  defaultDomains: z.array(z.string().max(60)).max(20).optional(),
  scoringWeights: z.object({
    accuracy: z.number().min(0).max(1),
    consistency: z.number().min(0).max(1),
    relevance: z.number().min(0).max(1),
    completeness: z.number().min(0).max(1),
    grounding: z.number().min(0).max(1),
    instructionFollowing: z.number().min(0).max(1),
  }).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  emailNotifications: z.boolean().optional(),
});

/** GET /api/settings/preferences */
router.get('/preferences', async (req: Request, res: Response) => {
  const prefs = await prisma.userPreference.findUnique({ where: { userId: req.user!.id } });
  if (!prefs) return res.json({ preferences: null });
  return res.json({
    preferences: {
      ...prefs,
      defaultDomains: jsonParse<string[] | null>(prefs.defaultDomains, null),
      scoringWeights: jsonParse<Record<string, number> | null>(prefs.scoringWeights, null),
    },
  });
});

/** PUT /api/settings/preferences — scoring weights must total 100%. */
router.put('/preferences', async (req: Request, res: Response) => {
  const parsed = preferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed.', details: parsed.error.flatten().fieldErrors });
  }
  const data = parsed.data;
  if (data.scoringWeights) {
    const total = Object.values(data.scoringWeights).reduce((a, b) => a + b, 0);
    if (Math.abs(total - 1) > 0.001) {
      return res.status(400).json({
        error: `Scoring weights must total 100% (currently ${(total * 100).toFixed(1)}%).`,
      });
    }
    // Validates non-negative + normalizes.
    normalizeWeights(data.scoringWeights);
  }
  const prefs = await prisma.userPreference.upsert({
    where: { userId: req.user!.id },
    update: {
      ...(data.defaultRuns != null ? { defaultRuns: data.defaultRuns } : {}),
      ...(data.defaultEvaluationMode ? { defaultEvaluationMode: data.defaultEvaluationMode } : {}),
      ...(data.defaultDomains ? { defaultDomains: jsonStringify(data.defaultDomains) } : {}),
      ...(data.scoringWeights ? { scoringWeights: jsonStringify(data.scoringWeights) } : {}),
      ...(data.theme ? { theme: data.theme } : {}),
      ...(data.emailNotifications != null ? { emailNotifications: data.emailNotifications } : {}),
    },
    create: { userId: req.user!.id },
  });
  return res.json({
    preferences: {
      ...prefs,
      defaultDomains: jsonParse<string[] | null>(prefs.defaultDomains, null),
      scoringWeights: jsonParse<Record<string, number> | null>(prefs.scoringWeights, null),
    },
  });
});

/** GET /api/settings/scoring-weights — effective weights (user override or default). */
router.get('/scoring-weights', async (req: Request, res: Response) => {
  const prefs = await prisma.userPreference.findUnique({ where: { userId: req.user!.id } });
  const weights = normalizeWeights(jsonParse<Record<string, number> | null>(prefs?.scoringWeights, null) ?? DEFAULT_WEIGHTS);
  return res.json({ weights, isDefault: !prefs?.scoringWeights });
});

const profileSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

/** PUT /api/settings/profile */
router.put('/profile', async (req: Request, res: Response) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed.', details: parsed.error.flatten().fieldErrors });
  }
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { name: parsed.data.name },
  });
  return res.json({ user: { id: user.id, name: user.name, email: user.email } });
});

/** DELETE /api/settings/account — removes the account and all its data. */
router.delete('/account', async (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  if (!password) return res.status(400).json({ error: 'Password confirmation is required.' });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Password is incorrect.' });
  await prisma.user.delete({ where: { id: user.id } });
  return res.json({ ok: true });
});

/** GET /api/settings/data-export — JSON export of the user's data. */
router.get('/data-export', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const [evaluations, benchmarks, reports, datasets] = await Promise.all([
    prisma.evaluation.findMany({ where: { userId }, include: { metrics: true, conflicts: true } }),
    prisma.benchmark.findMany({ where: { userId }, include: { questions: true, runs: true } }),
    prisma.report.findMany({ where: { userId }, select: { id: true, title: true, createdAt: true, content: true } }),
    prisma.uploadedDataset.findMany({ where: { userId } }),
  ]);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="consistency-guard-export.json"');
  return res.json({ exportedAt: new Date().toISOString(), evaluations, benchmarks, reports, datasets });
});

export default router;
