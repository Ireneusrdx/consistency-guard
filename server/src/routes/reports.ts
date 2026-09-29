import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { buildEvaluationReport, renderReportHtml, renderReportPdf } from '../utils/reportBuilder';
import { jsonStringify, jsonParse } from '../utils/json';

const router = Router();
router.use(requireAuth);

const REPORTS_DIR = path.join(__dirname, '..', '..', 'uploads', 'reports');

const createReportSchema = z.object({
  evaluationId: z.string().optional(),
  benchmarkId: z.string().optional(),
  title: z.string().max(200).optional(),
  format: z.enum(['json', 'html', 'pdf']).optional(),
}).refine((d) => d.evaluationId || d.benchmarkId, { message: 'Provide evaluationId or benchmarkId.' });

router.get('/', async (req: Request, res: Response) => {
  const reports = await prisma.report.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, format: true, evaluationId: true, benchmarkId: true, createdAt: true },
  });
  return res.json({ reports });
});

/** POST /api/reports — generates a report from real evaluation data. */
router.post('/', async (req: Request, res: Response) => {
  const parsed = createReportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed.', details: parsed.error.flatten().fieldErrors });
  }
  const { evaluationId, benchmarkId, title, format = 'json' } = parsed.data;

  if (evaluationId) {
    const owned = await prisma.evaluation.findFirst({ where: { id: evaluationId, userId: req.user!.id } });
    if (!owned) return res.status(404).json({ error: 'Evaluation not found.' });
    if (!['completed', 'partial'].includes(owned.status)) {
      return res.status(400).json({ error: `Report requires a finished evaluation (current status: ${owned.status}).` });
    }
  }
  if (benchmarkId) {
    const owned = await prisma.benchmark.findFirst({
      where: { id: benchmarkId, OR: [{ userId: req.user!.id }, { isCurated: true }] },
    });
    if (!owned) return res.status(404).json({ error: 'Benchmark not found.' });
  }

  try {
    // Benchmark reports aggregate per-model results; evaluation reports use the full pipeline output.
    const built = evaluationId
      ? await buildEvaluationReport(evaluationId)
      : await buildBenchmarkReportShim(req.user!.id, benchmarkId as string);
    const html = renderReportHtml(built);

    const report = await prisma.report.create({
      data: {
        userId: req.user!.id,
        evaluationId,
        benchmarkId,
        title: title ?? built.title,
        format,
        content: jsonStringify(built),
        htmlContent: html,
      },
    });

    if (format === 'pdf') {
      const filePath = await renderReportPdf(built, REPORTS_DIR, report.id);
      await prisma.report.update({ where: { id: report.id }, data: { filePath } });
    }

    await prisma.history.create({
      data: { userId: req.user!.id, action: 'report.generated', entityType: 'report', entityId: report.id, evaluationId },
    });

    return res.status(201).json({
      id: report.id,
      title: report.title,
      format,
      downloadUrl: format === 'pdf' ? `/api/reports/${report.id}?format=pdf` : undefined,
    });
  } catch (err) {
    // Never leak raw error text (Prisma internals, paths) to clients.
    console.error('[reports] generation failed:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Report generation failed. Please try again.' });
  }
});

async function buildBenchmarkReportShim(userId: string, benchmarkId: string) {
  const benchmark = await prisma.benchmark.findFirst({
    where: { id: benchmarkId, OR: [{ userId }, { isCurated: true }] },
    include: { runs: true, questions: true },
  });
  if (!benchmark) throw new Error('Benchmark not found.');
  const byModel = new Map<string, { acc: number[]; rel: number[] }>();
  for (const r of benchmark.runs) {
    if (!byModel.has(r.modelKey)) byModel.set(r.modelKey, { acc: [], rel: [] });
    const e = byModel.get(r.modelKey)!;
    if (r.groundTruthAccuracy != null) e.acc.push(r.groundTruthAccuracy);
    if (r.reliability != null) e.rel.push(r.reliability);
  }
  const avg = (xs: number[]) => (xs.length ? String(Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)) : 'n/a');
  return {
    title: `Consistency Guard Benchmark Report — ${benchmark.name}`,
    generatedAt: new Date().toISOString(),
    benchmarkId,
    executiveSummary: [
      `Benchmark "${benchmark.name}" (${benchmark.domain}): ${benchmark.questions.length} question(s), ${benchmark.runs.length} model-question run(s).`,
      ...[...byModel.entries()].map(
        ([m, v]) => `${m}: ground-truth accuracy ${avg(v.acc)}/100, avg reliability ${avg(v.rel)}/100.`,
      ),
    ],
    methodology: [
      'Each benchmark question was executed through the standard evaluation engine.',
      'Where reference answers exist, ground-truth accuracy is reported; otherwise the metric is omitted rather than estimated.',
    ],
    sections: [
      {
        heading: 'Per-model results',
        body: [...byModel.entries()].map(
          ([m, v]) => `${m}: ${v.acc.length} scored answer(s), ground-truth accuracy ${avg(v.acc)}, reliability ${avg(v.rel)}.`,
        ),
      },
    ],
    tables: [
      {
        title: 'Benchmark model summary',
        headers: ['Model', 'Ground-truth accuracy', 'Avg reliability', 'Runs'],
        rows: [...byModel.entries()].map(([m, v]) => [m, avg(v.acc), avg(v.rel), String(v.acc.length + v.rel.length)]),
      },
    ],
    limitations: [
      'Benchmark scores depend on reference-answer quality and question coverage.',
      'Small question counts produce noisy estimates — treat narrow gaps as inconclusive.',
    ],
  };
}

/** GET /api/reports/:id — ?format=json|html|pdf */
router.get('/:id', async (req: Request, res: Response) => {
  const report = await prisma.report.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
  });
  if (!report) return res.status(404).json({ error: 'Report not found.' });
  const format = (req.query.format as string) ?? 'json';

  if (format === 'html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(report.htmlContent ?? '');
  }
  if (format === 'pdf') {
    if (report.filePath && fs.existsSync(report.filePath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="consistency-guard-report-${report.id}.pdf"`);
      return res.sendFile(report.filePath);
    }
    return res.status(404).json({ error: 'No PDF was generated for this report.' });
  }
  return res.json({ id: report.id, title: report.title, content: jsonParse(report.content, null), createdAt: report.createdAt });
});

router.delete('/:id', async (req: Request, res: Response) => {
  const report = await prisma.report.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!report) return res.status(404).json({ error: 'Report not found.' });
  if (report.filePath && fs.existsSync(report.filePath)) {
    try { fs.unlinkSync(report.filePath); } catch { /* best effort */ }
  }
  await prisma.report.delete({ where: { id: report.id } });
  return res.json({ ok: true });
});

export default router;
