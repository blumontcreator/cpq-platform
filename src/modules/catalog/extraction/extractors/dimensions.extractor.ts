import type { Extractor, ExtractionInput, ExtractionResult, DimensionSet, DimensionValue } from "../types";
import { parseDimensions } from "../tokenizer";

export const dimensionsExtractor: Extractor<DimensionSet> = {
  name: "dimensions",

  extract(input: ExtractionInput): ExtractionResult<DimensionSet> | undefined {
    const raw = parseDimensions(input.corpus);
    if (!raw) return undefined;

    const unit = raw.unit ?? "in";

    const toVal = (n: number): DimensionValue => ({ value: n, unit });

    const set: DimensionSet = {
      width: toVal(raw.first),
      height: toVal(raw.second),
      raw: raw.raw,
    };
    if (raw.third !== undefined) {
      set.depth = toVal(raw.third);
    }

    // Higher confidence when both dimensions are plausible product sizes
    const plausible = raw.first > 0 && raw.second > 0;
    const confidence = plausible ? 0.88 : 0.55;

    return { value: set, confidence, evidence: [raw.raw] };
  },
};
