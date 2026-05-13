import type { Extractor, ExtractionInput, ExtractionResult } from "../types";
import { COLOR_DICT } from "../dictionaries/colors.dict";

/** Try multi-word phrases first (e.g. "matte black", "golden oak"). */
const MULTI_WORD_COLORS = Object.keys(COLOR_DICT)
  .filter((k) => k.includes(" "))
  .sort((a, b) => b.length - a.length);

export const colorExtractor: Extractor<string> = {
  name: "color",

  extract(input: ExtractionInput): ExtractionResult<string> | undefined {
    // Supplier synonym override
    for (const [alias, canonical] of Object.entries(input.supplierSynonyms)) {
      if (alias.startsWith("color:") && input.corpusLower.includes(alias.slice(6))) {
        return { value: canonical, confidence: 0.95, evidence: [alias] };
      }
    }

    // Multi-word phrases
    for (const phrase of MULTI_WORD_COLORS) {
      if (input.corpusLower.includes(phrase)) {
        const canonical = COLOR_DICT[phrase]!;
        return { value: canonical, confidence: 0.9, evidence: [phrase] };
      }
    }

    // Single tokens
    for (const token of input.tokens) {
      const key = token.toLowerCase();
      if (COLOR_DICT[key] && !input.claimedTokens.has(token)) {
        return { value: COLOR_DICT[key]!, confidence: 0.75, evidence: [token] };
      }
    }

    return undefined;
  },
};
