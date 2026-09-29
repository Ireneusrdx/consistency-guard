/** Uncertainty detection: hedges, refusals, and confidence/evidence mismatch. */

const HEDGE_PATTERNS = [
  /\bmight\b/i, /\bmay\b/i, /\bpossibly\b/i, /\bperhaps\b/i, /\bprobably\b/i,
  /\blikely\b/i, /\buncertain\b/i, /\bnot sure\b/i, /\bunclear\b/i,
  /\bdepends on\b/i, /\bvaries\b/i, /\bapproximate\b/i, /\bestimate\b/i,
  /\bto some extent\b/i, /\bgenerally\b/i, /\btends to\b/i, /\bseems\b/i,
  /\ballegedly\b/i, /\breportedly\b/i,
];

const REFUSAL_PATTERNS = [
  /\bi (can't|cannot|am unable to)\b/i,
  /\bunable to (answer|provide|determine)\b/i,
  /\bi don't have (enough|sufficient)\b/i,
  /\binsufficient information\b/i,
  /\bas an ai\b/i,
  /\bi must decline\b/i,
];

const CONFIDENT_PATTERNS = [
  /\bcertainly\b/i, /\bdefinitely\b/i, /\bundoubtedly\b/i,
  /\bwithout doubt\b/i, /\bclearly\b/i, /\bobviously\b/i,
  /\bguaranteed\b/i, /\b100%\b/,
];

export interface UncertaintyResult {
  hedgeCount: number;
  hasRefusal: boolean;
  confidentStatementCount: number;
  /** 0..100 — higher means more uncertainty expressed */
  uncertaintyScore: number;
  /** "High confidence / weak evidence" risk indicator */
  highConfidenceWeakEvidence: boolean;
  flags: string[];
}

export function analyzeUncertainty(text: string, evidenceStrength: number): UncertaintyResult {
  const sentences = text.split(/(?<=[.!?])\s+/);
  let hedgeCount = 0;
  let confidentStatementCount = 0;
  for (const s of sentences) {
    if (HEDGE_PATTERNS.some((p) => p.test(s))) hedgeCount++;
    if (CONFIDENT_PATTERNS.some((p) => p.test(s))) confidentStatementCount++;
  }
  const hasRefusal = REFUSAL_PATTERNS.some((p) => p.test(text));
  const flags: string[] = [];
  if (hasRefusal) flags.push('Model refused or declined to answer part of the prompt.');
  if (hedgeCount >= 3) flags.push(`Model hedged ${hedgeCount} times — treat specifics as provisional.`);
  else if (hedgeCount > 0) flags.push(`Model expressed uncertainty ${hedgeCount} time(s).`);

  const highConfidenceWeakEvidence = confidentStatementCount > 0 && evidenceStrength < 0.35;
  if (highConfidenceWeakEvidence) {
    flags.push(
      'HIGH CONFIDENCE / WEAK EVIDENCE: the model makes strongly confident claims with little retrieved evidence support — elevated hallucination risk.',
    );
  }

  const uncertaintyScore = Math.min(
    100,
    Math.round(hedgeCount * 12 + (hasRefusal ? 35 : 0)),
  );

  return {
    hedgeCount,
    hasRefusal,
    confidentStatementCount,
    uncertaintyScore,
    highConfidenceWeakEvidence,
    flags,
  };
}
