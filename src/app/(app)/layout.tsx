"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppDataProvider, useAppData } from "@/components/AppData";

const NAV = [
  { href: "/", label: "Dashboard", stage: null },
  { href: "/instagram", label: "Instagram Leads", stage: "Stage 4" },
  { href: "/telegram", label: "Telegram Clients", stage: "Stage 2" },
  { href: "/tasks", label: "Tasks", stage: null },
  { href: "/kpis", label: "KPIs & Weekly Reports", stage: "Stage 5" },
  { href: "/resources", label: "Resources & Booking Links", stage: null },
  { href: "/settings", label: "Settings", stage: null },
];

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, error, clearError, signOut, settings } = useAppData();

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          Miss Erika
          <small>{settings ? `Support for ${settings.manager_name}` : "Loading…"}</small>
        </div>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}>
                <span>{n.label}</span>
                {n.stage && <span className="soon">{n.stage}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="rail-foot">
          <button className="linklike" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="main">
        {error && (
          <div className="banner error" role="alert">
            <span>{error}</span>
            <button className="btn small" onClick={clearError}>Dismiss</button>
          </div>
        )}
        {ready ? children : <p className="sub">Loading your work space…</p>}
      </main>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppDataProvider>
      <Shell>{children}</Shell>
    </AppDataProvider>
  );
}
