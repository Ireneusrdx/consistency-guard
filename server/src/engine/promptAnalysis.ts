/** Prompt quality analysis + optimization. Pure heuristics, fully explainable. */

export interface PromptDimensions {
  role: number;
  context: number;
  constraints: number;
  specificity: number;
  outputSpec: number;
  clarity: number;
}

export interface PromptAnalysisResult {
  score: number; // 0..100
  dimensions: PromptDimensions;
  issues: string[];
  suggestions: string[];
}

const ROLE_PATTERNS = [/\byou are\b/i, /\bas a\b/i, /\bact as\b/i, /\brole\b/i];
const CONSTRAINT_PATTERNS = [
  /\bmust\b/i, /\bmust not\b/i, /\bdo not\b/i, /\bdon't\b/i, /\bnever\b/i,
  /\bavoid\b/i, /\bonly\b/i, /\bconstraint\b/i, /\blimit\b/i, /\bwithin\b/i,
];
const OUTPUT_PATTERNS = [
  /\bformat\b/i, /\bjson\b/i, /\bbullet\b/i, /\bnumbered\b/i, /\btable\b/i,
  /\bstructure\b/i, /\boutput\b/i, /\breturn\b/i, /\blength\b/i, /\bwords?\b/i,
  /\bparagraphs?\b/i, /\bsections?\b/i,
];
const VAGUE_WORDS = ['things', 'stuff', 'etc', 'some', 'something', 'somehow', 'kind of', 'sort of', 'a bit', 'various', 'several'];

function countMatches(patterns: RegExp[], text: string): number {
  return patterns.filter((p) => p.test(text)).length;
}

export function analyzePrompt(prompt: string): PromptAnalysisResult {
  const text = prompt.trim();
  const words = text.split(/\s+/).filter(Boolean);
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Role (0..100)
  const roleHits = countMatches(ROLE_PATTERNS, text);
  const role = Math.min(100, roleHits * 60 + (roleHits > 0 ? 20 : 0));
  if (role < 50) {
    issues.push('No clear role assigned to the model.');
    suggestions.push('Start with a role, e.g. "You are a senior backend engineer…".');
  }

  // Context (0..100)
  let context: number;
  if (words.length < 10) {
    context = 20;
    issues.push('Prompt is very short; the model lacks context.');
    suggestions.push('Add background: what this is for, who the audience is, and relevant facts.');
  } else if (words.length < 30) {
    context = 55;
    issues.push('Limited context provided.');
    suggestions.push('Add 1–2 sentences of background or constraints.');
  } else {
    context = Math.min(100, 70 + Math.min(30, words.length / 4));
  }

  // Constraints (0..100)
  const constraintHits = countMatches(CONSTRAINT_PATTERNS, text);
  const constraints = Math.min(100, constraintHits * 35);
  if (constraints < 35) {
    issues.push('Missing explicit constraints (what to do / avoid).');
    suggestions.push('State constraints explicitly: scope, tone, things to avoid.');
  }

  // Specificity (0..100)
  const vagueHits = VAGUE_WORDS.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(text)).length;
  const hasNumbers = /\d/.test(text);
  const hasExamples = /\b(example|e\.g\.|for instance|such as)\b/i.test(text);
  let specificity = 70 - vagueHits * 15 + (hasNumbers ? 10 : 0) + (hasExamples ? 10 : 0);
  specificity = Math.max(5, Math.min(100, specificity));
  if (vagueHits > 0) {
    issues.push(`Ambiguous terminology detected: ${VAGUE_WORDS.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(text)).join(', ')}.`);
    suggestions.push('Replace vague terms with concrete nouns, numbers, or examples.');
  }

  // Output spec (0..100)
  const outputHits = countMatches(OUTPUT_PATTERNS, text);
  const outputSpec = Math.min(100, outputHits * 40);
  if (outputSpec < 40) {
    issues.push('Expected output format is not specified.');
    suggestions.push('Define the output: format (bullets/JSON/table), length, and sections.');
  }

  // Clarity (0..100)
  const questionMarks = (text.match(/\?/g) ?? []).length;
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
  let clarity = 80;
  if (questionMarks > 2) {
    clarity -= 20;
    issues.push('Multiple questions in one prompt may dilute the answer.');
    suggestions.push('Split into separate evaluations or prioritize one question.');
  }
  if (sentences > 0 && words.length / sentences > 45) {
    clarity -= 15;
    issues.push('Very long sentences reduce clarity.');
  }
  clarity = Math.max(10, Math.min(100, clarity));

  const score = Math.round(
    (role + context + constraints + specificity + outputSpec + clarity) / 6,
  );

  return {
    score,
    dimensions: {
      role: Math.round(role),
      context: Math.round(context),
      constraints: Math.round(constraints),
      specificity: Math.round(specificity),
      outputSpec: Math.round(outputSpec),
      clarity: Math.round(clarity),
    },
    issues,
    suggestions,
  };
}

/** Generates an optimized prompt from analysis findings (template-based, explainable). */
export function optimizePrompt(prompt: string, analysis?: PromptAnalysisResult): string {
  const a = analysis ?? analyzePrompt(prompt);
  const text = prompt.trim();
  const parts: string[] = [];

  if (a.dimensions.role < 50) {
    parts.push('You are a knowledgeable domain expert. Answer precisely and cite key facts.');
  }
  parts.push(`Task: ${text}`);
  const additions: string[] = [];
  if (a.dimensions.context < 60) {
    additions.push('Assume an informed general audience; briefly define any specialized terms you use.');
  }
  if (a.dimensions.constraints < 35) {
    additions.push('Constraints: stay on topic, avoid speculation, and flag anything you are uncertain about.');
  }
  if (a.dimensions.outputSpec < 40) {
    additions.push('Output: structure your answer with a short summary first, then supporting points as bullet items.');
  }
  if (additions.length > 0) parts.push(additions.join(' '));

  return parts.join('\n\n');
}
