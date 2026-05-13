import type { Extractor, ExtractionInput, ExtractionResult, MotorizationInfo } from "../types";
import {
  MOTORIZED_TOKENS,
  MANUAL_TOKENS,
  MOTORIZATION_KIND_DICT,
} from "../dictionaries/motorization.dict";
import { containsAny } from "../tokenizer";

export const motorizationExtractor: Extractor<MotorizationInfo> = {
  name: "motorization",

  extract(input: ExtractionInput): ExtractionResult<MotorizationInfo> | undefined {
    const motorHit = containsAny(input.corpus, MOTORIZED_TOKENS);
    const manualHit = containsAny(input.corpus, MANUAL_TOKENS);

    if (!motorHit && !manualHit) return undefined;

    const motorized = !!motorHit;
    const hitToken = (motorHit ?? manualHit)!;
    const kind = MOTORIZATION_KIND_DICT[hitToken.toLowerCase()];
    const confidence = motorized ? 0.9 : 0.82;

    return {
      value: { motorized, kind },
      confidence,
      evidence: [hitToken],
    };
  },
};
