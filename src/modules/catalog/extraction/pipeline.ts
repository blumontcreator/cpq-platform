/**
 * Rule-based extraction pipeline.
 *
 * Implements ExtractionProvider so a future LLM-backed provider can be swapped in
 * at the call site without touching persistence or normalization.
 */
import type {
  ExtractionProvider,
  ExtractionInput,
  ExtractedAttributes,
  ExtractionMeta,
} from "./types";
import { EXTRACTOR_VERSION } from "./tokenizer";
import {
  seriesExtractor,
  colorExtractor,
  finishExtractor,
  materialExtractor,
  motorizationExtractor,
  mountingExtractor,
  dimensionsExtractor,
  sizeExtractor,
  voltageExtractor,
  packagingExtractor,
  regionExtractor,
  tierExtractor,
  accessoriesExtractor,
} from "./extractors";

// Tokens below this length are noise and excluded from unresolved tracking.
const MIN_UNRESOLVED_TOKEN_LEN = 3;

// Tokens that are structural noise across all catalogs (conjunctions, articles, etc.)
const STOP_TOKENS = new Set([
  "and", "or", "the", "a", "an", "in", "on", "of", "for",
  "with", "by", "at", "to", "from", "as", "is", "it",
  "this", "that", "no", "not", "new", "inc", "co", "ltd",
]);

class RulesBasedExtractionProvider implements ExtractionProvider {
  async run(input: ExtractionInput): Promise<{
    attributes: ExtractedAttributes;
    meta: ExtractionMeta;
  }> {
    const warnings: string[] = [];

    // Run every extractor in a defined priority order.
    // Each result's evidence tokens are added to claimedTokens to avoid double-counting.
    const series = seriesExtractor.extract(input);
    this.claimEvidence(input, series?.evidence);

    const color = colorExtractor.extract(input);
    this.claimEvidence(input, color?.evidence);

    const finish = finishExtractor.extract(input);
    this.claimEvidence(input, finish?.evidence);

    const material = materialExtractor.extract(input);
    this.claimEvidence(input, material?.evidence);

    const motorization = motorizationExtractor.extract(input);
    this.claimEvidence(input, motorization?.evidence);

    const mounting = mountingExtractor.extract(input);
    this.claimEvidence(input, mounting?.evidence);

    const dimensions = dimensionsExtractor.extract(input);
    this.claimEvidence(input, dimensions?.evidence);

    const size = sizeExtractor.extract(input);
    this.claimEvidence(input, size?.evidence);

    const voltage = voltageExtractor.extract(input);
    this.claimEvidence(input, voltage?.evidence);

    const packaging = packagingExtractor.extract(input);
    this.claimEvidence(input, packaging?.evidence);

    const region = regionExtractor.extract(input);
    this.claimEvidence(input, region?.evidence);

    const tier = tierExtractor.extract(input);
    this.claimEvidence(input, tier?.evidence);

    const accessories = accessoriesExtractor.extract(input);
    this.claimEvidence(input, accessories?.evidence);

    // Collect unresolved tokens (not claimed, not stop words, long enough).
    // Check both exact and lowercase form so case differences don't leak into the list.
    const unresolvedTokens = input.tokens.filter(
      (t) =>
        !input.claimedTokens.has(t) &&
        !input.claimedTokens.has(t.toLowerCase()) &&
        t.length >= MIN_UNRESOLVED_TOKEN_LEN &&
        !STOP_TOKENS.has(t.toLowerCase()) &&
        !/^\d+$/.test(t),
    );

    // Warn on ambiguous low-confidence extractions
    const resultsMap = {
      series,
      color,
      finish,
      material,
      motorization,
      mounting,
      dimensions,
      size,
      voltage,
      packaging,
      region,
      tier,
      accessories,
    } as const;

    const confidences: number[] = [];
    for (const [field, result] of Object.entries(resultsMap)) {
      if (!result) continue;
      confidences.push(result.confidence);
      if (result.confidence < 0.6) {
        warnings.push(`low_confidence:${field}(${result.confidence.toFixed(2)})`);
      }
    }

    const overallConfidence =
      confidences.length > 0
        ? confidences.reduce((s, c) => s + c, 0) / confidences.length
        : 0;

    const attributes: ExtractedAttributes = {
      ...(series && { series }),
      ...(color && { color }),
      ...(finish && { finish }),
      ...(material && { material }),
      ...(motorization && { motorization }),
      ...(mounting && { mounting }),
      ...(dimensions && { dimensions }),
      ...(size && { size }),
      ...(voltage && { voltage }),
      ...(packaging && { packaging }),
      ...(region && { region }),
      ...(tier && { tier }),
      ...(accessories && { accessories }),
    };

    const meta: ExtractionMeta = {
      overallConfidence,
      warnings,
      unresolvedTokens,
      extractorVersion: EXTRACTOR_VERSION,
      rulesBased: true,
    };

    return { attributes, meta };
  }

  private claimEvidence(
    input: ExtractionInput,
    evidence?: string[],
  ): void {
    if (!evidence) return;
    // Claim both the exact evidence string and any matching input token (case-insensitive)
    // so that unresolved-token tracking works regardless of capitalisation differences.
    for (const e of evidence) {
      input.claimedTokens.add(e);
      const lower = e.toLowerCase();
      for (const t of input.tokens) {
        if (t.toLowerCase() === lower) input.claimedTokens.add(t);
      }
    }
  }
}

/** Singleton rule-based provider. Replace with an LLM-backed instance to upgrade. */
export const ruleBasedExtractionProvider: ExtractionProvider =
  new RulesBasedExtractionProvider();
