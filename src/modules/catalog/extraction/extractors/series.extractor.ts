import type { Extractor, ExtractionInput, ExtractionResult } from "../types";

// Matches codes like "A400", "B2-100", "WB-300", "Series 5", "S7" at token boundaries.
const SERIES_CODE_RE = /^[A-Z]{1,4}[-_]?\d{1,5}[A-Z]?$/;
const SERIES_PHRASE_RE = /\bseries\s+(\w+)/i;

export const seriesExtractor: Extractor<string> = {
  name: "series",

  extract(input: ExtractionInput): ExtractionResult<string> | undefined {
    // 1. Supplier-specific known series from extractionHints
    for (const [alias, canonical] of Object.entries(input.supplierSynonyms)) {
      if (alias.startsWith("series:") && input.corpusLower.includes(alias.slice(7))) {
        return { value: canonical, confidence: 0.95, evidence: [alias] };
      }
    }

    // 2. "Series XYZ" phrase
    const phraseMatch = input.corpus.match(SERIES_PHRASE_RE);
    if (phraseMatch) {
      const value = phraseMatch[1].trim().toUpperCase();
      return { value, confidence: 0.85, evidence: [phraseMatch[0]] };
    }

    // 3. Standalone code token at the front of the name (highest specificity position)
    for (const token of input.tokens.slice(0, 4)) {
      if (SERIES_CODE_RE.test(token) && !input.claimedTokens.has(token)) {
        return { value: token.toUpperCase(), confidence: 0.75, evidence: [token] };
      }
    }

    return undefined;
  },
};
