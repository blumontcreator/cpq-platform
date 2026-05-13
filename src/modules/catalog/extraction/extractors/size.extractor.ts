import type { Extractor, ExtractionInput, ExtractionResult } from "../types";

const SIZE_LABELS: Record<string, string> = {
  xs: "XS",
  "x-small": "XS",
  "extra small": "XS",
  s: "S",
  small: "Small",
  m: "M",
  medium: "Medium",
  l: "L",
  large: "Large",
  xl: "XL",
  "x-large": "XL",
  "extra large": "XL",
  xxl: "XXL",
  "2xl": "XXL",
  "3xl": "3XL",
  king: "King",
  queen: "Queen",
  full: "Full",
  twin: "Twin",
  // numeric + label combos matched by phrase
};

const MULTI_WORD_SIZES = Object.keys(SIZE_LABELS)
  .filter((k) => k.includes(" "))
  .sort((a, b) => b.length - a.length);

export const sizeExtractor: Extractor<string> = {
  name: "size",

  extract(input: ExtractionInput): ExtractionResult<string> | undefined {
    for (const phrase of MULTI_WORD_SIZES) {
      if (input.corpusLower.includes(phrase)) {
        return { value: SIZE_LABELS[phrase]!, confidence: 0.85, evidence: [phrase] };
      }
    }
    for (const token of input.tokens) {
      const key = token.toLowerCase();
      if (SIZE_LABELS[key] && !input.claimedTokens.has(token)) {
        // Single-letter sizes (S, M, L) are ambiguous outside clear size contexts
        const confidence = token.length === 1 ? 0.45 : 0.78;
        return { value: SIZE_LABELS[key]!, confidence, evidence: [token] };
      }
    }
    return undefined;
  },
};
