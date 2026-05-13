import type { Extractor, ExtractionInput, ExtractionResult } from "../types";
import { MATERIAL_DICT } from "../dictionaries/materials.dict";

const MULTI_WORD_MATERIALS = Object.keys(MATERIAL_DICT)
  .filter((k) => k.includes(" "))
  .sort((a, b) => b.length - a.length);

export const materialExtractor: Extractor<string> = {
  name: "material",

  extract(input: ExtractionInput): ExtractionResult<string> | undefined {
    for (const phrase of MULTI_WORD_MATERIALS) {
      if (input.corpusLower.includes(phrase)) {
        return { value: MATERIAL_DICT[phrase]!, confidence: 0.88, evidence: [phrase] };
      }
    }
    for (const token of input.tokens) {
      const key = token.toLowerCase();
      if (MATERIAL_DICT[key] && !input.claimedTokens.has(token)) {
        return { value: MATERIAL_DICT[key]!, confidence: 0.75, evidence: [token] };
      }
    }
    return undefined;
  },
};
