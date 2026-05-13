import type { ImportProfile } from "./profile.types";

export const a400BlackProfile: ImportProfile = {
  profileKey: "a400-black",
  supplierCode: "A400",
  supplierDisplayName: "A400 Black",
  defaultCurrency: "USD",

  columnAliases: {
    supplierSku: ["SKU", "Sku", "Item", "Item #", "Part #", "Part Number", "Model"],
    supplierName: ["Name", "Product", "Product Name", "Title"],
    description: ["Description", "Desc", "Long Description", "Details"],
    listPrice: ["List", "List Price", "MSRP", "Price", "Dealer", "MAP"],
  },

  /**
   * A400-specific synonym overrides for the extraction pipeline.
   *
   * Key format: `<attributeType>:<raw_token_lowercase>`
   * Value: canonical label used in ExtractedAttributes
   *
   * Add entries here whenever A400 catalog files use non-standard terminology.
   * The generic dictionaries handle common cases; these cover A400 deviations only.
   */
  extractionHints: {
    // Series identifiers (prefix "series:")
    "series:a400": "A400",
    "series:wb": "WB",

    // Color aliases specific to A400 naming conventions
    "color:antique": "Antique White",
    "color:biscuit": "Ivory",
    "color:muslin": "Beige",

    // Tier labels A400 uses
    "tier:value": "Economy",
    "tier:select": "Standard",
    "tier:signature": "Premium",

    // Motorization shortcuts A400 uses
    "series:rts": "A400",
  },
};

export const importProfilesByKey = {
  [a400BlackProfile.profileKey]: a400BlackProfile,
} as const;
