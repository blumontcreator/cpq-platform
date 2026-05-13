"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/catalog",      label: "Catalog",       icon: "◫" },
  { href: "/quotes",       label: "Quotes",         icon: "⊟" },
  { href: "/intelligence", label: "Intelligence",   icon: "◈" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-48 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
      {/* Logo */}
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3.5">
        <span className="font-mono text-sm font-bold text-zinc-100">CPQ</span>
        <span className="rounded bg-blue-600 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
          CONSOLE
        </span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        <div className="px-2 space-y-0.5">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                }`}
              >
                <span className="w-4 text-center font-mono text-xs">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-zinc-800 px-4 py-3">
        <p className="text-[10px] font-mono text-zinc-600">operator console</p>
        <p className="text-[10px] font-mono text-zinc-700">v0.1.0</p>
      </div>
    </aside>
  );
}
