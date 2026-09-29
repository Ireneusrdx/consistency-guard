import { Router, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { parse as parseCsv } from 'csv-parse/sync';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { createEvaluation, waitForEvaluation, getEvaluationResults } from '../engine/evaluation';
import { jsonStringify, jsonParse } from '../utils/json';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const ok = /\.(csv|json)$/i.test(file.originalname) || ['text/csv', 'application/json'].includes(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error('Only .csv and .json files are accepted.'));
  },
});

interface DatasetRow {
  question: string;
  domain?: string;
  expected_answer?: string;
  difficulty?: string;
  tags?: string[];
}

const COLUMN_ALIASES: Record<string, string[]> = {
  question: ['question', 'prompt', 'q', 'text'],
  domain: ['domain', 'category', 'subject'],
  expected_answer: ['expected_answer', 'reference_answer', 'expectedanswer', 'answer', 'reference', 'ground_truth'],
  difficulty: ['difficulty', 'level'],
  tags: ['tags', 'labels'],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** Maps arbitrary CSV/JSON keys onto the canonical columns. */
function mapColumns(
  rawRows: Record<string, unknown>[],
  customMapping?: Record<string, string>,
): { rows: DatasetRow[]; mapping: Record<string, string>; warnings: string[] } {
  const warnings: string[] = [];
  if (rawRows.length === 0) return { rows: [], mapping: {}, warnings };
  const headers = Object.keys(rawRows[0]);
  const normalized = new Map(headers.map((h) => [normalizeHeader(h), h]));
  const mapping: Record<string, string> = {};

  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (customMapping?.[canonical] && normalized.has(normalizeHeader(customMapping[canonical]))) {
      mapping[canonical] = normalized.get(normalizeHeader(customMapping[canonical]))!;
      continue;
    }
    const found = aliases.map((a) => normalized.get(a)).find(Boolean);
    if (found) mapping[canonical] = found;
  }
  if (!mapping.question) {
    warnings.push(
      `No "question" column detected (looked for: ${COLUMN_ALIASES.question.join(', ')}). Provide a column mapping.`,
    );
  }

  const rows: DatasetRow[] = rawRows.map((raw) => {
    const get = (canonical: string): string | undefined => {
      const h = mapping[canonical];
      if (!h) return undefined;
      const v = raw[h];
      return v == null ? undefined : String(v).trim() || undefined;
    };
    const tagsRaw = get('tags');
    return {
      question: get('question') ?? '',
      domain: get('domain'),
      expected_answer: get('expected_answer'),
      difficulty: get('difficulty'),
      tags: tagsRaw ? tagsRaw.split(/[;,|]/).map((t) => t.trim()).filter(Boolean) : undefined,
    };
  });
  return { rows, mapping, warnings };
}

function validateRows(rows: DatasetRow[]): {
  valid: DatasetRow[];
  invalid: Array<{ index: number; reason: string }>;
  warnings: string[];
} {
  const valid: DatasetRow[] = [];
  const invalid: Array<{ index: number; reason: string }> = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    if (!row.question || row.question.length < 5) {
      invalid.push({ index, reason: 'Missing or too-short question text.' });
      return;
    }
    const key = row.question.toLowerCase().trim();
    if (seen.has(key)) {
      warnings.push(`Row ${index + 1}: duplicate question skipped.`);
      return;
    }
    seen.add(key);
    valid.push(row);
  });
  return { valid, invalid, warnings };
}

// ---------------------------------------------------------------------------
// Upload + dataset management
// ---------------------------------------------------------------------------

/**
 * POST /api/benchmarks/upload — validates CSV/JSON, stores an UploadedDataset,
 * and returns a preview (valid/invalid rows + warnings) before creating the benchmark.
 */
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded. Attach a .csv or .json file.' });
    const fileType = /\.json$/i.test(req.file.originalname) ? 'json' : 'csv';
    let rawRows: Record<string, unknown>[];
    try {
      if (fileType === 'json') {
        const parsed: unknown = JSON.parse(req.file.buffer.toString('utf8'));
        rawRows = Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [(parsed as Record<string, unknown>)];
      } else {
        rawRows = parseCsv(req.file.buffer.toString('utf8'), {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        }) as Record<string, unknown>[];
      }
    } catch {
      return res.status(400).json({ error: 'Could not parse the file. Check CSV/JSON formatting.' });
    }
    if (rawRows.length === 0) {
      return res.status(400).json({ error: 'The file contains no data rows.' });
    }
    if (rawRows.length > 500) {
      return res.status(400).json({ error: 'Dataset exceeds the 500-row limit.' });
    }

    let customMapping: Record<string, string> | undefined;
    if (req.body.mapping) {
      try {
        customMapping = JSON.parse(req.body.mapping);
      } catch {
        return res.status(400).json({ error: 'Invalid column mapping JSON.' });
      }
    }

    const { rows, mapping, warnings } = mapColumns(rawRows, customMapping);
    const { valid, invalid, warnings: rowWarnings } = validateRows(rows);
    const allWarnings = [...warnings, ...rowWarnings];

    const dataset = await prisma.uploadedDataset.create({
      data: {
        userId: req.user!.id,
        fileName: req.file.originalname,
        fileType,
        rowCount: rows.length,
        validRows: valid.length,
        invalidRows: invalid.length,
        validationSummary: jsonStringify({ warnings: allWarnings, invalidRows: invalid.slice(0, 20) }),
        columnMapping: jsonStringify(mapping),
        rows: jsonStringify(valid),
        status: valid.length > 0 ? 'processed' : 'failed',
      },
    });

    return res.status(201).json({
      datasetId: dataset.id,
      fileName: dataset.fileName,
      rowCount: rows.length,
      validRows: valid.length,
      invalidRows: invalid.length,
      warnings: allWarnings,
      preview: valid.slice(0, 5),
      mapping,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed.';
    return res.status(400).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

const createBenchmarkSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).optional(),
  domain: z.string().trim().max(60).optional(),
  datasetId: z.string().optional(),
  questions: z.array(z.object({
    questionText: z.string().min(1).max(5000),
    domain: z.string().max(60).optional(),
    expectedAnswer: z.string().max(20000).optional(),
    difficulty: z.string().max(30).optional(),
    tags: z.array(z.string()).optional(),
  })).max(200).optional(),
});

router.get('/', async (req: Request, res: Response) => {
  const benchmarks = await prisma.benchmark.findMany({
    where: { OR: [{ userId: req.user!.id }, { isCurated: true }] },
    include: {
      _count: { select: { questions: true, runs: true } },
      runs: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({
    benchmarks: benchmarks.map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      domain: b.domain,
      status: b.status,
      isCurated: b.isCurated,
      questionCount: b._count.questions,
      runCount: b._count.runs,
      lastRunAt: b.runs[0]?.createdAt ?? null,
      createdAt: b.createdAt,
    })),
  });
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = createBenchmarkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed.', details: parsed.error.flatten().fieldErrors });
  }
  const { name, description, domain, datasetId, questions } = parsed.data;

  const benchmark = await prisma.benchmark.create({
    data: { userId: req.user!.id, name, description, domain: domain ?? 'general', status: 'draft' },
  });

  if (datasetId) {
    const dataset = await prisma.uploadedDataset.findFirst({ where: { id: datasetId, userId: req.user!.id } });
    if (!dataset) {
      await prisma.benchmark.delete({ where: { id: benchmark.id } });
      return res.status(404).json({ error: 'Dataset not found.' });
    }
    const rows = jsonParse<DatasetRow[]>(dataset.rows, []);
    for (const row of rows) {
      await prisma.benchmarkQuestion.create({
        data: {
          benchmarkId: benchmark.id,
          questionText: row.question,
          domain: row.domain ?? domain ?? 'general',
          expectedAnswer: row.expected_answer,
          difficulty: row.difficulty,
          tags: row.tags ? jsonStringify(row.tags) : undefined,
        },
      });
    }
  }
  if (questions) {
    for (const q of questions) {
      await prisma.benchmarkQuestion.create({
        data: {
          benchmarkId: benchmark.id,
          questionText: q.questionText,
          domain: q.domain ?? domain ?? 'general',
          expectedAnswer: q.expectedAnswer,
          difficulty: q.difficulty,
          tags: q.tags ? jsonStringify(q.tags) : undefined,
        },
      });
    }
  }

  const count = await prisma.benchmarkQuestion.count({ where: { benchmarkId: benchmark.id } });
  await prisma.benchmark.update({ where: { id: benchmark.id }, data: { status: count > 0 ? 'ready' : 'draft' } });
  return res.status(201).json({ id: benchmark.id, questionCount: count });
});

router.get('/:id', async (req: Request, res: Response) => {
  const benchmark = await prisma.benchmark.findFirst({
    where: { id: req.params.id, OR: [{ userId: req.user!.id }, { isCurated: true }] },
    include: { questions: { orderBy: { createdAt: 'asc' } } },
  });
  if (!benchmark) return res.status(404).json({ error: 'Benchmark not found.' });
  return res.json(benchmark);
});

router.delete('/:id', async (req: Request, res: Response) => {
  const benchmark = await prisma.benchmark.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
  });
  if (!benchmark) return res.status(404).json({ error: 'Benchmark not found.' });
  if (benchmark.isCurated) return res.status(403).json({ error: 'Curated benchmarks cannot be deleted.' });
  await prisma.benchmark.delete({ where: { id: benchmark.id } });
  return res.json({ ok: true });
});

const runBenchmarkSchema = z.object({
  modelKeys: z.array(z.string().trim().min(1)).min(1).max(6),
  runs: z.number().int().min(1).max(5).optional(),
});

/**
 * POST /api/benchmarks/:id/run — executes every question through the same
 * evaluation engine (reduced runs for throughput) and records BenchmarkRuns.
 */
router.post('/:id/run', async (req: Request, res: Response) => {
  const benchmark = await prisma.benchmark.findFirst({
    where: { id: req.params.id, OR: [{ userId: req.user!.id }, { isCurated: true }] },
    include: { questions: true },
  });
  if (!benchmark) return res.status(404).json({ error: 'Benchmark not found.' });
  if (benchmark.questions.length === 0) {
    return res.status(400).json({ error: 'This benchmark has no questions to run.' });
  }
  const parsed = runBenchmarkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed.', details: parsed.error.flatten().fieldErrors });
  }
  const { modelKeys, runs = 2 } = parsed.data;

  await prisma.benchmark.update({ where: { id: benchmark.id }, data: { status: 'running' } });

  void (async () => {
    try {
      for (const q of benchmark.questions) {
        for (const modelKey of modelKeys) {
          const evaluationId = await createEvaluation({
            userId: req.user!.id,
            question: q.questionText,
            domain: q.domain,
            taskType: 'benchmark',
            evaluationMode: 'quick',
            modelKeys: [modelKey],
            runs,
            referenceAnswer: q.expectedAnswer ?? undefined,
            enableConflicts: false,
          });
          const status = await waitForEvaluation(evaluationId);
          let groundTruthAccuracy: number | null = null;
          let reliability: number | null = null;
          if (status === 'completed' || status === 'partial') {
            const results = await getEvaluationResults(evaluationId);
            const model = results?.models.find((m) => m.modelKey === modelKey);
            const acc = model?.metrics['accuracy'];
            if (acc && !acc.isEstimated) groundTruthAccuracy = acc.value;
            reliability = model?.metrics['reliability']?.value ?? null;
          }
          await prisma.benchmarkRun.create({
            data: {
              benchmarkId: benchmark.id,
              evaluationId,
              questionId: q.id,
              modelKey,
              status,
              groundTruthAccuracy,
              reliability,
            },
          });
        }
      }
      await prisma.benchmark.update({ where: { id: benchmark.id }, data: { status: 'completed' } });
    } catch (err) {
      await prisma.benchmark.update({
        where: { id: benchmark.id },
        data: { status: 'failed' },
      });
      console.error(`[benchmark ${benchmark.id}] run failed:`, err instanceof Error ? err.message : err);
    }
  })();

  return res.status(202).json({
    message: `Benchmark started: ${benchmark.questions.length} question(s) × ${modelKeys.length} model(s).`,
    benchmarkId: benchmark.id,
  });
});

/** GET /api/benchmarks/:id/results — aggregated model comparison + question-level rows. */
router.get('/:id/results', async (req: Request, res: Response) => {
  const benchmark = await prisma.benchmark.findFirst({
    where: { id: req.params.id, OR: [{ userId: req.user!.id }, { isCurated: true }] },
    include: {
      questions: true,
      runs: { include: { evaluation: { select: { avgReliability: true, userId: true } } }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!benchmark) return res.status(404).json({ error: 'Benchmark not found.' });

  const questionById = new Map(benchmark.questions.map((q) => [q.id, q]));
  const byModel = new Map<string, { accuracies: number[]; reliabilities: number[]; count: number }>();
  for (const r of benchmark.runs) {
    if (!byModel.has(r.modelKey)) byModel.set(r.modelKey, { accuracies: [], reliabilities: [], count: 0 });
    const entry = byModel.get(r.modelKey)!;
    entry.count++;
    if (r.groundTruthAccuracy != null) entry.accuracies.push(r.groundTruthAccuracy);
    if (r.reliability != null) entry.reliabilities.push(r.reliability);
  }
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

  return res.json({
    id: benchmark.id,
    name: benchmark.name,
    domain: benchmark.domain,
    status: benchmark.status,
    isCurated: benchmark.isCurated,
    models: [...byModel.entries()].map(([modelKey, v]) => ({
      modelKey,
      questionsEvaluated: v.count,
      groundTruthAccuracy: avg(v.accuracies),
      groundTruthAccuracyNote:
        v.accuracies.length > 0
          ? `Ground-truth accuracy over ${v.accuracies.length} question(s) with reference answers.`
          : 'No reference answers available — ground-truth accuracy cannot be computed.',
      avgReliability: avg(v.reliabilities),
    })),
    questions: benchmark.runs.map((r) => ({
      benchmarkRunId: r.id,
      question: questionById.get(r.questionId ?? '')?.questionText ?? null,
      domain: questionById.get(r.questionId ?? '')?.domain ?? null,
      expectedAnswer: questionById.get(r.questionId ?? '')?.expectedAnswer ?? null,
      modelKey: r.modelKey,
      status: r.status,
      groundTruthAccuracy: r.groundTruthAccuracy,
      reliability: r.reliability,
      // Never expose another user's evaluation ID in shared (curated)
      // benchmark results — it's only meaningful to its owner, and the
      // evaluations endpoint is ownership-scoped anyway.
      evaluationId: r.evaluation?.userId === req.user!.id ? r.evaluationId : null,
    })),
  });
});

export default router;
