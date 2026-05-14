export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { listOpportunities } from "@/modules/opportunity";
import { createOpportunityAction } from "../actions/opportunity.actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, statusBadge } from "@/components/ui/badge";
import Link from "next/link";

const CHANNEL_LABELS: Record<string, string> = {
  DIRECT: "Direct", PARTNER: "Partner", ONLINE: "Online", DISTRIBUTOR: "Distributor",
};

export default async function OpportunitiesPage() {
  const opportunities = await listOpportunities(prisma);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Opportunity Workspace</h1>
          <p className="text-xs text-zinc-500 mt-1">{opportunities.length} active opportunities</p>
        </div>
      </div>

      {/* Create opportunity */}
      <Card>
        <CardHeader label="New Opportunity" />
        <CardBody>
          <form action={createOpportunityAction} className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Customer Name *</label>
              <input name="customerName" required
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                placeholder="Acme Corp" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Customer account ID</label>
              <input name="customerId"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
                placeholder="Optional CRM or ERP reference" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Owner ID (optional)</label>
              <input name="salesOwnerId"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
                placeholder="Leave blank to assign yourself" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Channel</label>
              <select name="channel" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none">
                {Object.entries(CHANNEL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Target Margin %</label>
              <input name="targetMarginPct" type="number" step="1" defaultValue="30"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Est. Revenue ($)</label>
              <input name="estimatedRevenue" type="number" step="1000"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none"
                placeholder="50000" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Strategic Priority</label>
              <select name="strategicPriority" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none">
                {["STANDARD","IMPORTANT","STRATEGIC","MUST_WIN"].map((p) => (
                  <option key={p} value={p}>{p.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Notes</label>
              <input name="notes"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
                placeholder="Optional" />
            </div>
            <div className="flex items-end">
              <button type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded transition-colors">
                Create Opportunity
              </button>
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Opportunity list */}
      <div className="space-y-3">
        {opportunities.length === 0 ? (
          <p className="text-sm text-zinc-500">No opportunities yet. Create one above.</p>
        ) : (
          opportunities.map((opp) => (
            <Link key={opp.id} href={`/opportunities/${opp.id}`}>
              <Card className="hover:border-zinc-600 cursor-pointer transition-colors">
                <CardBody>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-zinc-100">{opp.customerName}</span>
                        <Badge variant={statusBadge(opp.status)}>{opp.status}</Badge>
                        {opp.strategicPriority !== "STANDARD" && (
                          <Badge variant={opp.strategicPriority === "MUST_WIN" ? "red" : opp.strategicPriority === "STRATEGIC" ? "purple" : "blue"}>
                            {opp.strategicPriority.replace(/_/g," ")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 font-mono">{opp.reference}</p>
                    </div>
                    <div className="flex gap-6 shrink-0 text-right">
                      <div>
                        <p className="text-xs text-zinc-500">Channel</p>
                        <p className="text-sm text-zinc-300">{CHANNEL_LABELS[opp.channel] ?? opp.channel}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">Target Margin</p>
                        <p className="text-sm text-zinc-300">{(opp.targetMarginPct * 100).toFixed(0)}%</p>
                      </div>
                      {opp.estimatedRevenue && (
                        <div>
                          <p className="text-xs text-zinc-500">Est. Revenue</p>
                          <p className="text-sm text-zinc-300">${opp.estimatedRevenue.toLocaleString()}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-zinc-500">Quotes</p>
                        <p className="text-sm text-zinc-300">{opp.quoteCount}</p>
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
