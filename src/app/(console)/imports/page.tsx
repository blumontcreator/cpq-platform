import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, StatRow } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function ImportsPage() {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: {
      imports: {
        orderBy: { startedAt: "desc" },
        take: 5,
      },
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">Import History</h1>
        <p className="text-xs text-zinc-500 mt-1">{suppliers.length} supplier(s) — click to compare imports</p>
      </div>

      {suppliers.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-zinc-500 text-center py-4">
              No supplier imports yet. Run the import pipeline to get started.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-6">
          {suppliers.map((supplier) => (
            <Card key={supplier.id}>
              <CardHeader label={`${supplier.name} (${supplier.code})`} />
              <CardBody>
                {supplier.imports.length === 0 ? (
                  <p className="text-sm text-zinc-500">No imports for this supplier.</p>
                ) : (
                  <div className="space-y-2">
                    {supplier.imports.map((imp, idx) => (
                      <div key={imp.id} className="flex items-center justify-between p-3 bg-zinc-900 rounded border border-zinc-800">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono text-zinc-300">{imp.sourceKey}</span>
                            {idx === 0 && <Badge variant="blue">Latest</Badge>}
                            <Badge variant={imp.status === "COMPLETED" ? "green" : imp.status === "FAILED" ? "red" : "yellow"}>
                              {imp.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-zinc-500 mt-1">{imp.startedAt.toLocaleString()}</p>
                        </div>
                        <div className="flex gap-4 items-center">
                          <StatRow label="Rows" value={imp.rowCount} />
                          <StatRow label="Parsed" value={imp.parsedCount} />
                          <StatRow label="Errors" value={imp.errorCount} />
                          {idx < supplier.imports.length - 1 && (
                            <Link
                              href={`/imports/${imp.id}/compare?baseId=${supplier.imports[idx + 1]?.id ?? ""}`}
                              className="text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap"
                            >
                              Compare vs prev →
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
