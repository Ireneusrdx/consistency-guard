import fs from 'fs';
import path from 'path';
import { jaccardSimilarity, tokenSet } from './normalize';
import { ExtractedClaim } from './claims';

export interface EvidenceItem {
  title: string;
  url: string;
  snippet: string;
  sourceType: 'documentation' | 'reference' | 'knowledge_base';
  confidence: number;
  /** Always false for retrieved references; true only for AI-generated text. */
  isAiGenerated: boolean;
}

export type ClaimStatus = 'supported' | 'contradicted' | 'unverified';

export interface ClaimVerification {
  claimText: string;
  status: ClaimStatus;
  confidence: number;
  evidence: EvidenceItem[];
  reason: string;
}

/**
 * Evidence retrieval layer.
 *
 * The corpus is configured via the EVIDENCE_CORPUS_PATH environment variable
 * (a JSON file of {title, url, snippet, sourceType, keywords} entries).
 * When unset, no evidence is retrieved and claims are reported unverified —
 * the pipeline never fabricates grounding. A small sample corpus ships at
 * server/data/sample-evidence-corpus.json for local trials; it is sample
 * data, not a production evidence source.
 */

interface CorpusSource {
  title: string;
  url: string;
  snippet: string;
  sourceType: EvidenceItem['sourceType'];
  keywords: string[];
}

function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function loadCorpus(): CorpusSource[] {
  const p = process.env.EVIDENCE_CORPUS_PATH;
  if (!p) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(path.resolve(p), 'utf8')) as CorpusSource[];
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (s) => s && typeof s.title === 'string' && typeof s.snippet === 'string' && Array.isArray(s.keywords),
    );
  } catch (err) {
    console.warn(`[evidence] could not load corpus at ${p}: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

const CORPUS: CorpusSource[] = loadCorpus();
if (CORPUS.length > 0) {
  console.log(`[evidence] loaded ${CORPUS.length} corpus entries.`);
} else {
  console.log('[evidence] no corpus configured (EVIDENCE_CORPUS_PATH unset) — claims will be unverified.');
}

/** Deterministically picks corpus entries relevant to the claim. Empty corpus → no evidence. */
export function retrieveEvidence(claim: ExtractedClaim): EvidenceItem[] {
  const claimTokens = tokenSet(claim.text);
  const scored = CORPUS.map((src, idx) => {
    const overlap = src.keywords.filter((k) => claimTokens.has(k)).length;
    // Deterministic tie-break so results are stable per claim.
    const tie = (hashString(claim.text) + idx * 7919) % 100 / 1000;
    return { src, score: overlap + tie };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  return scored.map(({ src, score }) => ({
    title: src.title,
    url: src.url,
    snippet: src.snippet,
    sourceType: src.sourceType,
    confidence: Math.min(0.95, 0.45 + score * 0.2),
    isAiGenerated: false,
  }));
}

function bestSnippetOverlap(claimText: string, evidence: EvidenceItem[]): number {
  let best = 0;
  for (const e of evidence) best = Math.max(best, jaccardSimilarity(claimText, e.snippet));
  return best;
}

/**
 * Claim–evidence comparison → supported / contradicted / unverified.
 * A claim already flagged as contradicted by cross-model conflict detection
 * keeps that status; otherwise snippet overlap decides support.
 */
export function verifyClaim(
  claim: ExtractedClaim,
  evidence: EvidenceItem[],
  contradictedByConflict: boolean,
): ClaimVerification {
  if (contradictedByConflict) {
    return {
      claimText: claim.text,
      status: 'contradicted',
      confidence: 0.8,
      evidence,
      reason: 'Another model made a directly incompatible claim; treat this assertion as disputed pending a primary source.',
    };
  }
  const overlap = bestSnippetOverlap(claim.text, evidence);
  if (overlap >= 0.3 && evidence.length > 0) {
    return {
      claimText: claim.text,
      status: 'supported',
      confidence: Math.min(0.9, 0.5 + overlap),
      evidence,
      reason: `Reference snippet overlaps the claim (similarity ${overlap.toFixed(2)}). Sources are retrieved references, not AI-generated text.`,
    };
  }
  return {
    claimText: claim.text,
    status: 'unverified',
    confidence: 0.4,
    evidence,
    reason:
      'No retrieved reference sufficiently overlaps this claim. It is neither confirmed nor refuted — do not treat it as verified fact.',
  };
}
