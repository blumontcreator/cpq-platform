"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function QuoteTabs({ quoteId }: { quoteId: string }) {
  const pathname = usePathname();
  const base = `/quotes/${quoteId}`;

  const tabs = [
    { href: base,                  label: "Quote & pricing"    },
    { href: `${base}/simulation`,  label: "Scenarios" },
    { href: `${base}/workflow`,    label: "Approvals"   },
    { href: `${base}/revisions`,   label: "History"  },
    { href: `${base}/negotiate`,   label: "Negotiation"  },
    { href: `${base}/outcome`,     label: "Outcome"    },
  ];

  return (
    <div className="flex items-center gap-0 border-b border-zinc-800">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`border-b-2 px-4 py-2.5 text-sm transition-colors ${
              active
                ? "border-blue-500 text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
