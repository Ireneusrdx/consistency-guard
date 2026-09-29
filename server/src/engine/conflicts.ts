import { jaccardSimilarity, extractNumbers, extractYears } from './normalize';
import { ExtractedClaim } from './claims';

export type ConflictType =
  | 'direct_contradiction'
  | 'numerical'
  | 'date'
  | 'definition'
  | 'recommendation'
  | 'unsupported';

export type Severity = 'low' | 'medium' | 'high';

export interface DetectedConflict {
  claimText: string;
  modelAKey: string;
  modelBKey?: string;
  conflictingClaimText: string;
  conflictType: ConflictType;
  severity: Severity;
  explanation: string;
}

export interface ClaimWithModel extends ExtractedClaim {
  modelKey: string;
}

const NEGATIONS = /\b(not|no|never|cannot|can't|isn't|aren't|wasn't|weren't|don't|doesn't|didn't|won't|impossible|false|incorrect)\b/i;

/**
 * Severity logic (explicit, non-arbitrary):
 * - HIGH:   direct contradiction (negated restatement), or numeric/date
 *           disagreement between claims that are otherwise near-identical
 *           (similarity ≥ 0.7) — i.e. the models agree on the framing but
 *           state incompatible facts.
 * - MEDIUM: numeric/date disagreement with moderate overlap (0.45–0.7), or
 *           two definitions of the same subject that diverge.
 * - LOW:    recommendation differences, or claims no other model addresses
 *           (unsupported assertions).
 */
function severityFor(type: ConflictType, similarity: number): Severity {
  if (type === 'direct_contradiction') return 'high';
  if (type === 'numerical' || type === 'date') {
    if (similarity >= 0.7) return 'high';
    if (similarity >= 0.45) return 'medium';
    return 'low';
  }
  if (type === 'definition') return 'medium';
  if (type === 'recommendation') return 'low';
  return 'low';
}

function numbersDiffer(a: number[], b: number[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  return !a.some((x) => b.some((y) => Math.abs(x - y) < 1e-9));
}

function stripNegation(text: string): string {
  return text.replace(NEGATIONS, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Compares claims across models and detects contradictions / disagreements.
 * Only claims from DIFFERENT models are compared.
 */
export function detectConflicts(claims: ClaimWithModel[]): DetectedConflict[] {
  const conflicts: DetectedConflict[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const a = claims[i];
      const b = claims[j];
      if (a.modelKey === b.modelKey) continue;

      const pairKey = [a.text, b.text].sort().join('||');
      if (seen.has(pairKey)) continue;

      const sim = jaccardSimilarity(a.text, b.text);
      if (sim < 0.35) continue; // unrelated claims

      const aNums = extractNumbers(a.text);
      const bNums = extractNumbers(b.text);
      const aYears = extractYears(a.text);
      const bYears = extractYears(b.text);
      const aNeg = NEGATIONS.test(a.text);
      const bNeg = NEGATIONS.test(b.text);

      let type: ConflictType | null = null;
      let explanation = '';

      if (aNeg !== bNeg && jaccardSimilarity(stripNegation(a.text), stripNegation(b.text)) >= 0.6) {
        type = 'direct_contradiction';
        explanation =
          `One model asserts the claim while the other negates it: "${truncate(a.text)}" vs "${truncate(b.text)}".`;
      } else if (numbersDiffer(aYears, bYears)) {
        type = 'date';
        explanation = `The models cite different dates/years (${aYears.join(', ')} vs ${bYears.join(', ')}) for an otherwise similar claim.`;
      } else if (numbersDiffer(aNums, bNums)) {
        type = 'numerical';
        explanation = `The models state different numbers (${aNums.join(', ')} vs ${bNums.join(', ')}) for an otherwise similar claim.`;
      } else if (a.type === 'definition' && b.type === 'definition' && sim < 0.65) {
        type = 'definition';
        explanation = `The models define the same subject differently (semantic similarity ${sim.toFixed(2)}).`;
      } else if (a.type === 'recommendation' && b.type === 'recommendation' && sim < 0.6) {
        type = 'recommendation';
        explanation = `The models recommend different courses of action.`;
      }

      if (type) {
        seen.add(pairKey);
        conflicts.push({
          claimText: a.text,
          modelAKey: a.modelKey,
          modelBKey: b.modelKey,
          conflictingClaimText: b.text,
          conflictType: type,
          severity: severityFor(type, sim),
          explanation,
        });
      }
    }
  }

  // Unsupported assertions: claims no other model addresses at all.
  const byModel = new Map<string, ClaimWithModel[]>();
  for (const c of claims) {
    if (!byModel.has(c.modelKey)) byModel.set(c.modelKey, []);
    byModel.get(c.modelKey)!.push(c);
  }
  const modelKeys = [...byModel.keys()];
  if (modelKeys.length > 1) {
    for (const c of claims) {
      const addressedElsewhere = claims.some(
        (o) => o.modelKey !== c.modelKey && jaccardSimilarity(o.text, c.text) >= 0.35,
      );
      if (!addressedElsewhere && c.confidence >= 0.6) {
        conflicts.push({
          claimText: c.text,
          modelAKey: c.modelKey,
          modelBKey: undefined,
          conflictingClaimText: '',
          conflictType: 'unsupported',
          severity: 'low',
          explanation: `No other model made a comparable claim, so this assertion stands unsupported by cross-model agreement.`,
        });
      }
    }
  }

  const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return conflicts.sort((x, y) => rank[x.severity] - rank[y.severity]);
}

function truncate(s: string, n = 90): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
