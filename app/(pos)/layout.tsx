"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useStaffSession } from "@/lib/auth/useStaffSession";
import { clearSession } from "@/lib/auth/session";
import { ToastProvider } from "./_components/Toast";
import { ConfirmProvider } from "./_components/ConfirmDialog";
import { Badge } from "./_components/Badge";

type IconProps = { className?: string };

function HomeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path d="M4 11.5 12 4l8 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TabsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path d="M6 3h12v17l-2.5-1.5L14 20l-2-1.5L10 20l-2-1.5L6 20V3Z" strokeLinejoin="round" />
      <path d="M9 8h6M9 12h6" strokeLinecap="round" />
    </svg>
  );
}

function ReportsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path d="M5 20V11M12 20V5M19 20v-7" strokeLinecap="round" />
      <path d="M3 20h18" strokeLinecap="round" />
    </svg>
  );
}

function StaffIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 20c0-4.5 3-6.5 6.5-6.5s6.5 2 6.5 6.5" strokeLinecap="round" />
    </svg>
  );
}

function ProductsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" strokeLinejoin="round" />
      <path d="M4 7l8 4 8-4M12 11v10" strokeLinejoin="round" />
    </svg>
  );
}

function InventoryIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <rect x="3.5" y="7" width="17" height="4" rx="1" />
      <rect x="3.5" y="13" width="17" height="4" rx="1" />
      <path d="M7 9h2M7 15h2" strokeLinecap="round" />
    </svg>
  );
}

function TablesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path d="M3 9h18M6 9v11M18 9v11M3 9l1.5-5h15L21 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CategoriesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path d="M4 5h7l2 2h7v12H4V5Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AdminHubIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path d="M12 2.5 3.5 6v6c0 5 3.6 8.2 8.5 9.5 4.9-1.3 8.5-4.5 8.5-9.5V6L12 2.5Z" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type NavItem = {
  href: string;
  label: string;
  adminOnly: boolean;
  icon: (props: IconProps) => React.ReactNode;
};

// Desktop has room for every admin link directly; the mobile bottom bar
// doesn't, so admin-only pages besides Reports funnel through /admin instead.
const DESKTOP_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Home", adminOnly: false, icon: HomeIcon },
  { href: "/tabs", label: "Tabs", adminOnly: false, icon: TabsIcon },
  { href: "/reports", label: "Reports", adminOnly: true, icon: ReportsIcon },
  { href: "/admin/staff", label: "Staff", adminOnly: true, icon: StaffIcon },
  { href: "/admin/products", label: "Products", adminOnly: true, icon: ProductsIcon },
  { href: "/admin/inventory", label: "Inventory", adminOnly: true, icon: InventoryIcon },
  { href: "/admin/tables", label: "Tables", adminOnly: true, icon: TablesIcon },
  { href: "/admin/categories", label: "Categories", adminOnly: true, icon: CategoriesIcon },
];

const MOBILE_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Home", adminOnly: false, icon: HomeIcon },
  { href: "/tabs", label: "Tabs", adminOnly: false, icon: TabsIcon },
  { href: "/reports", label: "Reports", adminOnly: true, icon: ReportsIcon },
  { href: "/admin", label: "Admin", adminOnly: true, icon: AdminHubIcon },
];

function PosLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const session = useStaffSession();
  // getServerSnapshot always returns null, so the very first client render/
  // effect pass after a hard navigation sees session === null even when a
  // valid session exists in localStorage — before React's hydration
  // correction re-render lands with the real value. Skip the redirect check
  // on that first pass so it doesn't fire on stale data.
  const [checkedClient, setCheckedClient] = useState(false);
  useEffect(() => {
    setCheckedClient(true);
  }, []);

  useEffect(() => {
    if (checkedClient && session === null) router.replace("/login");
  }, [checkedClient, session, router]);

  if (!checkedClient || !session) return null;

  function logout() {
    clearSession();
    router.replace("/login");
  }

  const isAdmin = session.staff_role === "admin";
  const desktopItems = DESKTOP_NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin);
  const mobileItems = MOBILE_NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin);
  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + "/");

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="flex min-h-full flex-1 flex-col">
          <header className="no-print flex items-center justify-between border-b border-line bg-surface px-4 py-3">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="font-semibold text-brand-600 dark:text-brand-400">
                Mabeshte POS
              </Link>
              <nav className="hidden items-center gap-4 md:flex">
                {desktopItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`text-sm transition-colors hover:text-brand-600 dark:hover:text-brand-400 ${
                      isActive(item.href) ? "font-semibold text-brand-600 dark:text-brand-400" : "text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden items-center gap-2 sm:flex">
                <span className="text-ink-muted">{session.staff_name}</span>
                <Badge variant={isAdmin ? "brand" : "neutral"}>{isAdmin ? "Admin" : "Cashier"}</Badge>
              </span>
              <button
                onClick={logout}
                className="text-ink-muted transition-colors hover:text-brand-600 dark:hover:text-brand-400"
              >
                Log out
              </button>
            </div>
          </header>

          <main className="flex flex-1 flex-col pb-16 md:pb-0">{children}</main>

          <nav className="no-print fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
            {mobileItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
                    active ? "text-brand-600 dark:text-brand-400" : "text-ink-muted"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <PosLayoutInner>{children}</PosLayoutInner>
    </Suspense>
  );
}
