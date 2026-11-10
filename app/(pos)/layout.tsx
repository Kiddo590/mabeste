"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStaffSession } from "@/lib/auth/useStaffSession";
import { clearSession } from "@/lib/auth/session";

export default function PosLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
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

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <nav className="flex items-center justify-between border-b border-amber-500/20 px-4 py-3 dark:border-amber-400/15">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-amber-600 dark:text-amber-400">Mabeste POS</span>
          <Link href="/tabs" className="text-sm hover:text-amber-600 hover:underline dark:hover:text-amber-400">
            Tabs
          </Link>
          <Link href="/reports" className="text-sm hover:text-amber-600 hover:underline dark:hover:text-amber-400">
            Reports
          </Link>
          {session.staff_role === "admin" && (
            <>
              <Link href="/admin/staff" className="text-sm hover:text-amber-600 hover:underline dark:hover:text-amber-400">
                Staff
              </Link>
              <Link href="/admin/products" className="text-sm hover:text-amber-600 hover:underline dark:hover:text-amber-400">
                Products
              </Link>
              <Link href="/admin/inventory" className="text-sm hover:text-amber-600 hover:underline dark:hover:text-amber-400">
                Inventory
              </Link>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-500">
            {session.staff_name} &middot; {session.staff_role}
          </span>
          <button onClick={logout} className="text-zinc-500 hover:text-amber-600 hover:underline dark:hover:text-amber-400">
            Log out
          </button>
        </div>
      </nav>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
