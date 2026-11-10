"use client";

import { useStaffSession } from "@/lib/auth/useStaffSession";

// The pos layout already redirects logged-out staff to /login; this only
// adds the missing admin-only gate. Today "admin-only" pages are reachable
// by any staff who navigates there directly — RLS still blocks most writes,
// but stock_movements_insert has no role restriction at all (cashiers need
// it for sale/void_return rows from Tabs), so a cashier could otherwise
// submit real inventory adjustments from this page.
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const session = useStaffSession();
  if (!session) return null;
  if (session.staff_role !== "admin") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-lg font-semibold">Admins only</p>
        <p className="text-sm text-zinc-500">You don&apos;t have access to this page.</p>
      </div>
    );
  }
  return <>{children}</>;
}
