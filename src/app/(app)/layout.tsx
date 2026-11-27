"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AppDataProvider, useAppData } from "@/components/AppData";
import { Icon } from "@/components/Icon";
import { bucketOf } from "@/lib/core";

const NAV = [
  { href: "/", label: "Dashboard", icon: "dashboard", stage: null },
  { href: "/telegram", label: "Telegram Clients", icon: "telegram", stage: "Stage 2" },
  { href: "/instagram", label: "Instagram Leads", icon: "instagram", stage: "Stage 4" },
  { href: "/tasks", label: "Tasks", icon: "tasks", stage: null },
  { href: "/kpis", label: "KPIs & Weekly Reports", icon: "kpi", stage: "Stage 5" },
  { href: "/office", label: "Office", icon: "office", stage: null },
  { href: "/resources", label: "Resources & Booking Links", icon: "link", stage: null },
];

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, error, clearError, signOut, settings, tasks, today } = useAppData();
  const [menu, setMenu] = useState(false);

  const needAttention = tasks.filter((t) => {
    const b = bucketOf(t, today);
    return b === "overdue" || b === "today";
  }).length;
  const name = settings?.display_name || "Erika";

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <img className="logo" src="/icon.svg" alt="" width={40} height={40} />
          <div>
            <div className="brand-name">Miss Erika</div>
            <div className="brand-sub">Your work assistant</div>
          </div>
        </div>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}>
                <Icon name={n.icon} />
                <span className="label">{n.label}</span>
                                {n.href === "/tasks" && needAttention > 0 && <span className="badge">{needAttention}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="quick">
          <h3>Quick Actions</h3>
          <Link className="quick-btn" href="/tasks?new=1"><Icon name="plus" /> Add Task</Link>
          <Link className="quick-btn" href="/resources?new=1"><Icon name="link" /> Add Booking Link</Link>
          <Link className="quick-btn" href={`/reports/${today}`}><Icon name="report" /> View Reports</Link>
        </div>

        <div className="me">
          {menu && (
            <div className="me-menu">
              <Link href="/settings" onClick={() => setMenu(false)}><Icon name="settings" /> Profile &amp; settings</Link>
              <button onClick={signOut}><Icon name="logout" /> Sign out</button>
            </div>
          )}
          <button className="me-btn" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
            <span className="avatar">
              {settings?.avatar_url ? <img src={settings.avatar_url} alt="" /> : name.slice(0, 1).toUpperCase()}
            </span>
            <span style={{ flex: 1 }}>
              <div className="me-name">{name}</div>
              <div className="me-role">{settings?.role_title || "Assistant"}</div>
            </span>
            <Icon name="chevron" size={16} />
          </button>
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
