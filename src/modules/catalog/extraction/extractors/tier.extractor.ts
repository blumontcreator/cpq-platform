import type { Extractor, ExtractionInput, ExtractionResult } from "../types";
import { TIER_DICT } from "../dictionaries/tier.dict";

const MULTI_WORD_TIERS = Object.keys(TIER_DICT)
  .filter((k) => k.includes(" "))
  .sort((a, b) => b.length - a.length);

export const tierExtractor: Extractor<string> = {
  name: "tier",

  extract(input: ExtractionInput): ExtractionResult<string> | undefined {
    for (const phrase of MULTI_WORD_TIERS) {
      if (input.corpusLower.includes(phrase)) {
        return { value: TIER_DICT[phrase]!, confidence: 0.85, evidence: [phrase] };
      }
    }
    for (const token of input.tokens) {
      const key = token.toLowerCase();
      if (TIER_DICT[key] && !input.claimedTokens.has(token)) {
        return { value: TIER_DICT[key]!, confidence: 0.78, evidence: [token] };
      }
    }
    return undefined;
  },
};
