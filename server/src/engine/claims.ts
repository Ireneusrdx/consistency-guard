import { splitSentences, extractNumbers, extractYears } from './normalize';

export type ClaimType = 'factual' | 'numeric' | 'date' | 'definition' | 'recommendation';

export interface ExtractedClaim {
  text: string;
  type: ClaimType;
  confidence: number; // heuristic 0..1 that the sentence is a verifiable claim
}

const CLAIM_VERBS = /\b(is|are|was|were|has|have|had|can|cannot|can't|will|does|did|means|refers|equals|contains|requires|supports|causes|leads|prevents)\b/i;
const RECOMMENDATION = /\b(should|must|recommend|recommended|best practice|avoid|prefer|use instead)\b/i;
const DEFINITION = /\b(is|are|was|were)\s+(a|an|the)\b/i;

/**
 * Heuristic claim extraction: splits into sentences and keeps those that
 * look like verifiable assertions (not questions, hedges, or fragments).
 */
export function extractClaims(text: string): ExtractedClaim[] {
  const claims: ExtractedClaim[] = [];
  for (const sentence of splitSentences(text)) {
    const s = sentence.trim();
    if (s.length < 25 || s.length > 600) continue;
    if (s.endsWith('?')) continue;
    if (/^(here|below|note|warning|tip)\b/i.test(s) && s.length < 60) continue;

    const hasNumber = extractNumbers(s).length > 0;
    const hasYear = extractYears(s).length > 0;
    const isDefinition = DEFINITION.test(s);
    const isRecommendation = RECOMMENDATION.test(s);
    const hasClaimVerb = CLAIM_VERBS.test(s);

    if (!hasNumber && !hasYear && !isDefinition && !isRecommendation && !hasClaimVerb) continue;

    let type: ClaimType = 'factual';
    if (hasYear) type = 'date';
    else if (hasNumber) type = 'numeric';
    else if (isRecommendation) type = 'recommendation';
    else if (isDefinition) type = 'definition';

    let confidence = 0.55;
    if (hasNumber || hasYear) confidence += 0.15;
    if (isDefinition) confidence += 0.1;
    if (s.length > 60) confidence += 0.05;

    claims.push({ text: s, type, confidence: Math.min(0.95, confidence) });
  }
  return claims;
}
