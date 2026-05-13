import type { ReactNode } from "react";
import { Sidebar } from "@/components/console/sidebar";
import { requireConsoleAuth } from "@/lib/auth/guards";
import { requireOrganization } from "@/lib/tenant";

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const operator = await requireConsoleAuth();
  await requireOrganization();

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <Sidebar operatorEmail={operator.email} operatorRole={operator.role} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
