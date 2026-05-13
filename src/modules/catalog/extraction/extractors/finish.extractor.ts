import type { Extractor, ExtractionInput, ExtractionResult } from "../types";
import { FINISH_DICT } from "../dictionaries/finishes.dict";

const MULTI_WORD_FINISHES = Object.keys(FINISH_DICT)
  .filter((k) => k.includes(" "))
  .sort((a, b) => b.length - a.length);

export const finishExtractor: Extractor<string> = {
  name: "finish",

  extract(input: ExtractionInput): ExtractionResult<string> | undefined {
    for (const phrase of MULTI_WORD_FINISHES) {
      if (input.corpusLower.includes(phrase)) {
        return { value: FINISH_DICT[phrase]!, confidence: 0.88, evidence: [phrase] };
      }
    }
    for (const token of input.tokens) {
      const key = token.toLowerCase();
      if (FINISH_DICT[key] && !input.claimedTokens.has(token)) {
        return { value: FINISH_DICT[key]!, confidence: 0.72, evidence: [token] };
      }
    }
    return undefined;
  },
};
