import type { Extractor, ExtractionInput, ExtractionResult } from "../types";

const ACCESSORY_TERMS: readonly string[] = [
  "valance",
  "fascia",
  "bracket",
  "brackets",
  "mounting bracket",
  "installation kit",
  "remote",
  "remote control",
  "receiver",
  "motor",
  "wand",
  "tassels",
  "weights",
  "chain",
  "cord",
  "lift cord",
  "continuous loop",
  "pull cord",
  "bottom rail",
  "headrail",
  "pelmet",
  "cassette",
  "end cap",
  "end caps",
  "privacy liner",
  "blackout liner",
  "liner",
];

/** Multi-word terms first, sorted by length descending. */
const SORTED_ACCESSORY_TERMS = [...ACCESSORY_TERMS].sort((a, b) => b.length - a.length);

export const accessoriesExtractor: Extractor<string[]> = {
  name: "accessories",

  extract(input: ExtractionInput): ExtractionResult<string[]> | undefined {
    const found: string[] = [];
    const lower = input.corpusLower;

    for (const term of SORTED_ACCESSORY_TERMS) {
      if (lower.includes(term.toLowerCase())) {
        found.push(term);
      }
    }

    if (!found.length) return undefined;

    const confidence = found.length > 2 ? 0.85 : 0.7;
    return { value: found, confidence, evidence: found };
  },
};
