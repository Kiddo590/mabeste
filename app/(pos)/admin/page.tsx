"use client";

import Link from "next/link";
import { RequireAdmin } from "../_components/RequireAdmin";
import { PageHeader } from "../_components/PageHeader";

const TILES = [
  {
    href: "/admin/products",
    label: "Products",
    hint: "Catalogue, prices, photos",
    icon: (
      <path d="M12 3 4 7v10l8 4 8-4V7l-8-4ZM4 7l8 4 8-4M12 11v10" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    href: "/admin/inventory",
    label: "Inventory",
    hint: "Stock levels and restocks",
    icon: <path d="M3.5 7h17v4h-17zM3.5 13h17v4h-17zM7 9h2M7 15h2" strokeLinecap="round" />,
  },
  {
    href: "/admin/staff",
    label: "Staff",
    hint: "Logins, roles, PINs",
    icon: <path d="M12 4.75a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5ZM5.5 20c0-4.5 3-6.5 6.5-6.5s6.5 2 6.5 6.5" strokeLinecap="round" />,
  },
  {
    href: "/admin/tables",
    label: "Tables",
    hint: "Where staff open tabs",
    icon: <path d="M3 9h18M6 9v11M18 9v11M3 9l1.5-5h15L21 9" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    href: "/admin/categories",
    label: "Categories",
    hint: "Group the menu",
    icon: <path d="M4 5h7l2 2h7v12H4V5Z" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    href: "/reports",
    label: "Reports",
    hint: "Sales and payments",
    icon: <path d="M5 20V11M12 20V5M19 20v-7M3 20h18" strokeLinecap="round" />,
  },
];

function AdminHubContent() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader title="Admin" subtitle="Manage the catalogue, stock, staff and venue setup." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {TILES.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="flex flex-col items-start gap-2 rounded-2xl border border-line bg-surface p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
                {t.icon}
              </svg>
            </span>
            <span className="text-sm font-semibold">{t.label}</span>
            <span className="text-xs text-ink-muted">{t.hint}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function AdminHubPage() {
  return (
    <RequireAdmin>
      <AdminHubContent />
    </RequireAdmin>
  );
}
