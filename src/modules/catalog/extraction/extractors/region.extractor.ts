import type { Extractor, ExtractionInput, ExtractionResult } from "../types";
import { REGION_DICT } from "../dictionaries/region.dict";

const MULTI_WORD_REGIONS = Object.keys(REGION_DICT)
  .filter((k) => k.includes(" "))
  .sort((a, b) => b.length - a.length);

export const regionExtractor: Extractor<string> = {
  name: "region",

  extract(input: ExtractionInput): ExtractionResult<string> | undefined {
    for (const phrase of MULTI_WORD_REGIONS) {
      if (input.corpusLower.includes(phrase)) {
        return { value: REGION_DICT[phrase]!, confidence: 0.88, evidence: [phrase] };
      }
    }
    for (const token of input.tokens) {
      const key = token.toLowerCase();
      if (REGION_DICT[key] && !input.claimedTokens.has(token)) {
        // Short codes like "US", "CA" require neighbouring context → lower confidence
        const confidence = token.length <= 2 ? 0.5 : 0.8;
        return { value: REGION_DICT[key]!, confidence, evidence: [token] };
      }
    }
    return undefined;
  },
};
