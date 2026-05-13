/**
 * Health check endpoint.
 *
 * Used by:
 *   - Load balancers (ALB/nginx health probe)
 *   - Container orchestrators (Kubernetes liveness/readiness probes)
 *   - Uptime monitors (BetterStack, Datadog synthetics)
 *
 * GET /api/health → 200 { status: "ok" } | 503 { status: "degraded", errors: [...] }
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateEnv } from "@/lib/env";
import { metrics } from "@/lib/observability/metrics";

export const runtime = "nodejs";
// Don't cache health checks
export const dynamic = "force-dynamic";

interface HealthResponse {
  status: "ok" | "degraded" | "down";
  version: string;
  timestamp: string;
  checks: HealthCheck[];
  latencyMs: number;
}

interface HealthCheck {
  name: string;
  status: "pass" | "fail" | "warn";
  latencyMs?: number;
  detail?: string;
}

export async function GET() {
  const start = Date.now();
  const checks: HealthCheck[] = [];

  // ── 1. Environment validation ────────────────────────────────────────
  const env = validateEnv();
  checks.push({
    name:   "env",
    status: env.valid ? "pass" : "fail",
    detail: env.valid
      ? `${env.summary.filter((s) => s.status === "ok").length}/${env.summary.length} vars present`
      : env.errors.join("; "),
  });

  // ── 2. Database connectivity ─────────────────────────────────────────
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({
      name:      "database",
      status:    "pass",
      latencyMs: Date.now() - dbStart,
      detail:    "PostgreSQL reachable",
    });
  } catch (err) {
    checks.push({
      name:      "database",
      status:    "fail",
      latencyMs: Date.now() - dbStart,
      detail:    err instanceof Error ? err.message : "unknown DB error",
    });
  }

  // ── 3. Core table accessibility (basic smoke test) ────────────────────
  try {
    const counts = await Promise.all([
      prisma.supplier.count(),
      prisma.quote.count(),
      prisma.opportunity.count(),
    ]);
    checks.push({
      name:   "schema",
      status: "pass",
      detail: `suppliers=${counts[0]}, quotes=${counts[1]}, opportunities=${counts[2]}`,
    });
  } catch (err) {
    checks.push({
      name:   "schema",
      status: "fail",
      detail: err instanceof Error ? err.message : "schema check failed",
    });
  }

  // ── 4. Metrics collector ──────────────────────────────────────────────
  try {
    const m = metrics.flush();
    checks.push({
      name:   "metrics",
      status: "pass",
      detail: `${m.timings.length} timing buckets, ${m.counters.length} counters`,
    });
  } catch {
    checks.push({ name: "metrics", status: "warn", detail: "metrics collector unavailable" });
  }

  const hasFail  = checks.some((c) => c.status === "fail");
  const hasWarn  = checks.some((c) => c.status === "warn");
  const status   = hasFail ? "down" : hasWarn ? "degraded" : "ok";
  const httpCode = hasFail ? 503 : 200;

  const body: HealthResponse = {
    status,
    version:   process.env.npm_package_version ?? "unknown",
    timestamp: new Date().toISOString(),
    checks,
    latencyMs: Date.now() - start,
  };

  return NextResponse.json(body, { status: httpCode });
}
