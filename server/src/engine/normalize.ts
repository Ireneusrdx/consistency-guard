/** Text normalization + tokenization shared by the analysis engine. */

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”"']/g, '"')
    .replace(/[^a-z0-9\s.\-+%$]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set(
  'the a an and or of to in is are was were be been on for with as by at from that this these those it its into how what why when where which who whom whose do does did can could should would will shall may might must have has had having not no yes if then than so such very more most other some any each every all both about over after before between under within without per via vs versus there their they them he she we you your our ours his her hers also just like than too'.split(
    ' ',
  ),
);

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

export function contentTokens(text: string): string[] {
  return tokenize(text).filter((t) => !STOP_WORDS.has(t) && t.length > 2);
}

export function tokenSet(text: string): Set<string> {
  return new Set(contentTokens(text));
}

/** Jaccard similarity over content-token sets, 0..1. */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Extracts integer/float numbers (incl. years) from text. */
export function extractNumbers(text: string): number[] {
  const matches = text.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
  return matches.map(Number).filter((n) => Number.isFinite(n));
}

/** Extracts 4-digit years in a plausible range. */
export function extractYears(text: string): number[] {
  const matches = text.match(/\b(19|20)\d{2}\b/g) ?? [];
  return matches.map(Number);
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
