/**
 * Environment validation.
 *
 * Called at startup (health check, first request) to surface missing/invalid
 * configuration before the platform serves real traffic.
 *
 * Design:
 *   - Fails fast with a clear error list — no cryptic Prisma connection errors
 *   - Distinguishes REQUIRED (hard failure) from RECOMMENDED (warning only)
 *   - Safe to call multiple times (cached after first pass)
 */

export interface EnvVar {
  name: string;
  required: boolean;
  description: string;
  redact?: boolean;
}

const ENV_SPEC: EnvVar[] = [
  {
    name:        "DATABASE_URL",
    required:    true,
    description: "PostgreSQL connection string (Supabase session pooler)",
    redact:      true,
  },
  {
    name:        "NEXT_PUBLIC_SUPABASE_URL",
    required:    false,
    description: "Supabase project URL (required for console auth)",
  },
  {
    name:        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    required:    false,
    description: "Supabase anon / publishable key (server + browser; never use service_role here)",
    redact:      true,
  },
  {
    name:        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    required:    false,
    description: "Supabase publishable key (preferred over legacy anon JWT in new projects)",
    redact:      true,
  },
  {
    name:        "DIRECT_URL",
    required:    false,
    description: "Direct connection URL for Prisma migrations (bypasses pooler)",
    redact:      true,
  },
  {
    name:        "NODE_ENV",
    required:    false,
    description: "Runtime environment (development | production | test)",
  },
  {
    name:        "NEXT_PUBLIC_APP_URL",
    required:    false,
    description: "Public base URL for absolute link generation",
  },
  {
    name:        "DIAGNOSTICS_SECRET",
    required:    false,
    description: "Bearer token protecting GET /api/diagnostics (required in production)",
    redact:      true,
  },
];

export interface EnvValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary: Array<{
    name: string;
    status: "ok" | "missing" | "warning";
    description: string;
    value?: string;
  }>;
  checkedAt: string;
}

let cachedResult: EnvValidationResult | null = null;

export function validateEnv(force = false): EnvValidationResult {
  if (cachedResult && !force) return cachedResult;

  const errors:   string[] = [];
  const warnings: string[] = [];

  const summary = ENV_SPEC.map((spec) => {
    const raw = process.env[spec.name];
    const present = raw !== undefined && raw.trim() !== "";

    if (!present && spec.required) {
      errors.push(`Missing required env var: ${spec.name} — ${spec.description}`);
      return { name: spec.name, status: "missing" as const, description: spec.description };
    }

    if (!present) {
      warnings.push(`Optional env var not set: ${spec.name} — ${spec.description}`);
      return { name: spec.name, status: "warning" as const, description: spec.description };
    }

    const displayValue = spec.redact ? `${raw!.slice(0, 8)}…` : raw!;
    return { name: spec.name, status: "ok" as const, description: spec.description, value: displayValue };
  });

  // Validate DATABASE_URL format
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && !dbUrl.startsWith("postgres")) {
    errors.push(`DATABASE_URL must start with postgres:// or postgresql://`);
  }

  cachedResult = {
    valid:     errors.length === 0,
    errors,
    warnings,
    summary,
    checkedAt: new Date().toISOString(),
  };

  return cachedResult;
}
