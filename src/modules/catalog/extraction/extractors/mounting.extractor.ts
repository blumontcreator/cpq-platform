import type { Extractor, ExtractionInput, ExtractionResult } from "../types";
import { MOUNTING_DICT } from "../dictionaries/mounting.dict";

const MULTI_WORD_MOUNTS = Object.keys(MOUNTING_DICT)
  .filter((k) => k.includes(" "))
  .sort((a, b) => b.length - a.length);

export const mountingExtractor: Extractor<string> = {
  name: "mounting",

  extract(input: ExtractionInput): ExtractionResult<string> | undefined {
    for (const phrase of MULTI_WORD_MOUNTS) {
      if (input.corpusLower.includes(phrase)) {
        return { value: MOUNTING_DICT[phrase]!, confidence: 0.92, evidence: [phrase] };
      }
    }
    // Single token shortcuts: "IM", "OM"
    for (const token of input.tokens) {
      const key = token.toLowerCase();
      if (MOUNTING_DICT[key] && !input.claimedTokens.has(token)) {
        // Short abbreviations are lower confidence without context
        const confidence = token.length <= 2 ? 0.55 : 0.8;
        return { value: MOUNTING_DICT[key]!, confidence, evidence: [token] };
      }
    }
    return undefined;
  },
};
