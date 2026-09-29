import { jaccardSimilarity, tokenSet } from './normalize';
import { ExtractedClaim } from './claims';

export interface ConsistencyResult {
  /** 0..100 */
  score: number;
  pairwise: number[][];
  stablePairs: number;
  totalPairs: number;
  explanation: string;
}

/**
 * Consistency is measured semantically (token Jaccard + claim overlap),
 * NEVER by exact string equality.
 */
export function pairwiseConsistency(texts: string[]): number[][] {
  const n = texts.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      matrix[i][j] = i === j ? 1 : jaccardSimilarity(texts[i], texts[j]);
    }
  }
  return matrix;
}

export function claimOverlapSimilarity(a: ExtractedClaim[], b: ExtractedClaim[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  let total = 0;
  for (const ca of a) {
    let best = 0;
    for (const cb of b) {
      best = Math.max(best, jaccardSimilarity(ca.text, cb.text));
    }
    total += best;
  }
  return total / a.length;
}

/**
 * Semantic consistency across repeated runs:
 * score = mean of (0.7 * text similarity + 0.3 * claim overlap) over pairs.
 */
export function calculateConsistency(
  texts: string[],
  claimsPerRun: ExtractedClaim[][],
): ConsistencyResult {
  const n = texts.length;
  if (n <= 1) {
    return {
      score: 100,
      pairwise: [[1]],
      stablePairs: 0,
      totalPairs: 0,
      explanation: 'Only one run was produced, so consistency is trivially 100.',
    };
  }
  const pairwise = pairwiseConsistency(texts);
  let sum = 0;
  let stablePairs = 0;
  let totalPairs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const textSim = pairwise[i][j];
      const claimSim = claimOverlapSimilarity(claimsPerRun[i] ?? [], claimsPerRun[j] ?? []);
      const combined = 0.7 * textSim + 0.3 * claimSim;
      sum += combined;
      totalPairs++;
      if (combined >= 0.55) stablePairs++;
    }
  }
  const score = Math.round((sum / totalPairs) * 100);
  return {
    score,
    pairwise,
    stablePairs,
    totalPairs,
    explanation: `${stablePairs}/${totalPairs} run pairs were semantically aligned (similarity ≥ 0.55).`,
  };
}

/** Mean pairwise similarity of one model's runs vs every other model's runs. */
export function crossModelAgreement(textsByModel: Map<string, string[]>): Map<string, number> {
  const result = new Map<string, number>();
  const keys = [...textsByModel.keys()];
  for (const key of keys) {
    const mine = textsByModel.get(key) ?? [];
    const others: string[] = [];
    for (const other of keys) {
      if (other !== key) others.push(...(textsByModel.get(other) ?? []));
    }
    if (mine.length === 0 || others.length === 0) {
      result.set(key, 0);
      continue;
    }
    let sum = 0;
    let count = 0;
    for (const m of mine) {
      for (const o of others) {
        sum += jaccardSimilarity(m, o);
        count++;
      }
    }
    result.set(key, Math.round((sum / count) * 100));
  }
  return result;
}

export { tokenSet };
