import type { Extractor, ExtractionInput, ExtractionResult, PackagingInfo } from "../types";
import { parsePackaging } from "../dictionaries/packaging.dict";

export const packagingExtractor: Extractor<PackagingInfo> = {
  name: "packaging",

  extract(input: ExtractionInput): ExtractionResult<PackagingInfo> | undefined {
    const info = parsePackaging(input.corpus);
    if (!info) return undefined;
    return { value: info, confidence: 0.9, evidence: [info.raw] };
  },
};
