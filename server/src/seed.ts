import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from './db';
import { ensureProviders } from './utils/ensureProviders';
import { createEvaluation, waitForEvaluation, getEvaluationResults } from './engine/evaluation';
import { buildEvaluationReport, renderReportHtml } from './utils/reportBuilder';
import { jsonStringify } from './utils/json';

/**
 * DEVELOPMENT-ONLY seed data:
 * - demo user (demo@consistency.guard / Demo123!@)
 * - curated benchmark datasets with reference answers
 * - sample evaluations, conflicts, evidence, and a sample report
 *
 * Refuses to run in production (NODE_ENV=production) unless ALLOW_SEED=true
 * is set explicitly. Production deployments must never be seeded with the
 * demo user or sample content.
 */
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== 'true') {
  console.error('[seed] refused: will not seed demo data in production. Set ALLOW_SEED=true to override.');
  process.exit(1);
}

const CURATED_BENCHMARKS: Array<{
  name: string;
  description: string;
  domain: string;
  questions: Array<{ q: string; a: string; difficulty: string }>;
}> = [
  {
    name: 'Programming Fundamentals',
    description: 'Core programming concepts with verified reference answers.',
    domain: 'programming',
    questions: [
      { q: 'What does Array.prototype.map() do in JavaScript?', a: 'It creates a new array populated with the results of calling a provided function on every element of the original array.', difficulty: 'easy' },
      { q: 'Explain the difference between let, const, and var in JavaScript.', a: 'var is function-scoped and hoisted; let and const are block-scoped. const cannot be reassigned after initialization, while let can.', difficulty: 'easy' },
      { q: 'What is a primary key in a relational database?', a: 'A primary key is a column or set of columns that uniquely identifies each row in a table and cannot contain NULL values.', difficulty: 'easy' },
      { q: 'Describe how a hash table handles collisions.', a: 'Common strategies are chaining (linked lists of entries per bucket) and open addressing (probing for the next free slot).', difficulty: 'medium' },
      { q: 'What is the time complexity of binary search on a sorted array?', a: 'O(log n) time complexity.', difficulty: 'easy' },
      { q: 'Explain what a REST API is.', a: 'REST is an architectural style where resources are manipulated through stateless HTTP operations (GET, POST, PUT, DELETE) on URIs.', difficulty: 'easy' },
      { q: 'What does the SQL JOIN clause do?', a: 'JOIN combines rows from two or more tables based on a related column between them.', difficulty: 'easy' },
      { q: 'What is recursion in programming?', a: 'Recursion is when a function calls itself to solve smaller instances of a problem, with a base case that stops the recursion.', difficulty: 'easy' },
    ],
  },
  {
    name: 'Mathematics',
    description: 'Arithmetic, algebra, and probability with exact answers.',
    domain: 'mathematics',
    questions: [
      { q: 'What is 17 multiplied by 23?', a: '391', difficulty: 'easy' },
      { q: 'Solve for x: 3x + 7 = 22.', a: 'x = 5', difficulty: 'easy' },
      { q: 'What is the derivative of x^3 + 2x with respect to x?', a: '3x^2 + 2', difficulty: 'medium' },
      { q: 'What is the probability of rolling two sixes with two fair dice?', a: '1/36, approximately 2.78%', difficulty: 'medium' },
      { q: 'What is the square root of 144?', a: '12', difficulty: 'easy' },
      { q: 'Simplify: (2^4 * 2^3) / 2^5.', a: '4', difficulty: 'medium' },
    ],
  },
  {
    name: 'Reasoning',
    description: 'Logic puzzles and structured reasoning.',
    domain: 'reasoning',
    questions: [
      { q: 'All mammals are warm-blooded. A whale is a mammal. Is a whale warm-blooded?', a: 'Yes. By modus ponens, since whales are mammals and all mammals are warm-blooded, whales are warm-blooded.', difficulty: 'easy' },
      { q: 'If some A are B and all B are C, does it follow that some A are C?', a: 'Yes. The A that are B are also C, so some A are C.', difficulty: 'medium' },
      { q: 'A bat and ball cost $1.10 in total. The bat costs $1 more than the ball. How much does the ball cost?', a: '$0.05 (5 cents).', difficulty: 'medium' },
      { q: 'If you rearrange the letters "CIFAIPC" you get the name of a what?', a: 'A Pacific ocean — "PACIFIC".', difficulty: 'medium' },
    ],
  },
  {
    name: 'General Knowledge',
    description: 'Established facts verifiable against references.',
    domain: 'general',
    questions: [
      { q: 'What is the capital of France?', a: 'Paris', difficulty: 'easy' },
      { q: 'In which year did the Berlin Wall fall?', a: '1989', difficulty: 'easy' },
      { q: 'What is the chemical symbol for gold?', a: 'Au', difficulty: 'easy' },
      { q: 'Which planet is known as the Red Planet?', a: 'Mars', difficulty: 'easy' },
    ],
  },
];

const SAMPLE_EVALUATIONS = [
  {
    question: 'Explain why database indexes speed up queries but slow down writes.',
    domain: 'programming',
    taskType: 'explanation',
    models: ['gpt-4o-mini', 'claude-3-5-haiku'],
  },
  {
    question: 'What is the time complexity of quicksort in the average and worst case?',
    domain: 'programming',
    taskType: 'qa',
    models: ['gpt-4o-mini', 'gemini-1.5-flash'],
    referenceAnswer: 'Average case O(n log n); worst case O(n^2) when partitions are badly unbalanced.',
  },
];

async function main(): Promise<void> {
  console.log('Seeding Consistency Guard…');
  await ensureProviders();

  const passwordHash = await bcrypt.hash('Demo123!@', 12);
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@consistency.guard' },
    update: { name: 'Demo User', passwordHash },
    create: { name: 'Demo User', email: 'demo@consistency.guard', passwordHash },
  });
  await prisma.userPreference.upsert({
    where: { userId: demoUser.id },
    update: {},
    create: { userId: demoUser.id },
  });
  console.log(`Demo user: demo@consistency.guard / Demo123!@`);

  for (const bench of CURATED_BENCHMARKS) {
    const existing = await prisma.benchmark.findFirst({
      where: { name: bench.name, isCurated: true },
    });
    if (existing) {
      console.log(`Benchmark "${bench.name}" already exists — skipping.`);
      continue;
    }
    const created = await prisma.benchmark.create({
      data: {
        name: bench.name,
        description: bench.description,
        domain: bench.domain,
        status: 'ready',
        isCurated: true,
      },
    });
    for (const item of bench.questions) {
      await prisma.benchmarkQuestion.create({
        data: {
          benchmarkId: created.id,
          questionText: item.q,
          domain: bench.domain,
          expectedAnswer: item.a,
          difficulty: item.difficulty,
        },
      });
    }
    console.log(`Benchmark "${bench.name}" created (${bench.questions.length} questions).`);
  }

  for (const sample of SAMPLE_EVALUATIONS) {
    const existing = await prisma.evaluation.findFirst({
      where: { userId: demoUser.id, questionText: sample.question },
    });
    if (existing) {
      console.log(`Sample evaluation already exists — skipping: "${sample.question.slice(0, 50)}…"`);
      continue;
    }
    console.log(`Running sample evaluation: "${sample.question.slice(0, 60)}…"`);
    const id = await createEvaluation({
      userId: demoUser.id,
      question: sample.question,
      domain: sample.domain,
      taskType: sample.taskType,
      evaluationMode: 'consistency',
      modelKeys: sample.models,
      runs: 3,
      referenceAnswer: (sample as { referenceAnswer?: string }).referenceAnswer,
    });
    const status = await waitForEvaluation(id);
    const results = await getEvaluationResults(id);
    console.log(
      `  → status=${status}, avgReliability=${results?.avgReliability}, conflicts=${results?.conflicts.length}`,
    );

    if (status === 'completed' || status === 'partial') {
      const built = await buildEvaluationReport(id);
      const html = renderReportHtml(built);
      await prisma.report.create({
        data: {
          userId: demoUser.id,
          evaluationId: id,
          title: `Sample report — ${sample.question.slice(0, 50)}…`,
          format: 'json',
          content: jsonStringify(built),
          htmlContent: html,
        },
      });
      console.log('  → sample report generated.');
    }
  }

  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
