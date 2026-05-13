import type { Extractor, ExtractionInput, ExtractionResult, VoltageInfo } from "../types";
import { parseVoltage } from "../dictionaries/voltage.dict";

export const voltageExtractor: Extractor<VoltageInfo> = {
  name: "voltage",

  extract(input: ExtractionInput): ExtractionResult<VoltageInfo> | undefined {
    const info = parseVoltage(input.corpus);
    if (!info) return undefined;
    return { value: info, confidence: 0.94, evidence: [info.raw] };
  },
};
