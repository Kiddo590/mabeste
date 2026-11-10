"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStaffSession } from "@/lib/auth/useStaffSession";
import { clearSession } from "@/lib/auth/session";

export default function PosLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const session = useStaffSession();

  useEffect(() => {
    if (session === null) router.replace("/login");
  }, [session, router]);

  if (!session) return null;

  function logout() {
    clearSession();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <nav className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
        <div className="flex items-center gap-4">
          <span className="font-semibold">Mabeste POS</span>
          <Link href="/tabs" className="text-sm hover:underline">
            Tabs
          </Link>
          <Link href="/reports" className="text-sm hover:underline">
            Reports
          </Link>
          {session.staff_role === "admin" && (
            <>
              <Link href="/admin/staff" className="text-sm hover:underline">
                Staff
              </Link>
              <Link href="/admin/products" className="text-sm hover:underline">
                Products
              </Link>
              <Link href="/admin/inventory" className="text-sm hover:underline">
                Inventory
              </Link>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-500">
            {session.staff_name} &middot; {session.staff_role}
          </span>
          <button onClick={logout} className="text-zinc-500 hover:underline">
            Log out
          </button>
        </div>
      </nav>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
