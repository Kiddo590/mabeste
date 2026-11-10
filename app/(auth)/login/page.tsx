"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listStaffForPicker, loginWithPin, type StaffListEntry } from "@/lib/auth/pin";

export default function LoginPage() {
  const router = useRouter();
  const [staffList, setStaffList] = useState<StaffListEntry[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    listStaffForPicker()
      .then(setStaffList)
      .catch(() => setListError("Couldn't load staff list — check your connection."));
  }, []);

  function pressDigit(d: string) {
    if (pin.length >= 6) return;
    setError(null);
    setPin((p) => p + d);
  }

  function backspace() {
    setError(null);
    setPin((p) => p.slice(0, -1));
  }

  async function submit() {
    if (!selectedStaffId || pin.length < 4) return;
    setLoading(true);
    setError(null);
    try {
      await loginWithPin(selectedStaffId, pin);
      router.push("/tabs");
    } catch {
      setError("Incorrect PIN");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  if (!selectedStaffId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-gradient-to-b from-brand-50/60 via-white to-white p-8 dark:from-brand-950/20 dark:via-zinc-950 dark:to-zinc-950">
        <div className="flex w-full max-w-xl flex-col items-center gap-10 rounded-3xl border border-black/5 bg-white/80 px-6 py-12 text-center shadow-xl shadow-brand-900/5 backdrop-blur sm:px-12 dark:border-white/5 dark:bg-zinc-900/60">
          <div className="flex flex-col items-center gap-2">
            <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl">
              Mabeste <span className="text-brand-600 dark:text-brand-400">POS</span>
            </h1>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-400">
              Staff sign-in
            </p>
          </div>
          {listError && <p className="text-red-600">{listError}</p>}
          <div className="grid w-full grid-cols-2 gap-4 sm:grid-cols-3">
            {staffList.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedStaffId(s.id)}
                className="group flex flex-col items-center gap-3 rounded-2xl border border-black/10 bg-white px-6 py-8 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-500/50 hover:bg-brand-50 hover:shadow-lg dark:border-white/10 dark:bg-zinc-900 dark:hover:border-brand-400/40 dark:hover:bg-brand-950/20"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700 transition-colors group-hover:bg-brand-600 group-hover:text-white dark:bg-brand-900/40 dark:text-brand-300 dark:group-hover:bg-brand-400 dark:group-hover:text-black">
                  {s.name.charAt(0).toUpperCase()}
                </span>
                <span className="text-lg font-medium">{s.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const selectedName = staffList.find((s) => s.id === selectedStaffId)?.name;

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-gradient-to-b from-brand-50/60 via-white to-white p-8 dark:from-brand-950/20 dark:via-zinc-950 dark:to-zinc-950">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-3xl border border-black/5 bg-white/80 px-8 py-10 shadow-xl shadow-brand-900/5 backdrop-blur dark:border-white/5 dark:bg-zinc-900/60">
        <button
          onClick={() => {
            setSelectedStaffId(null);
            setPin("");
            setError(null);
          }}
          className="self-start text-sm text-zinc-500 hover:text-brand-600 hover:underline dark:hover:text-brand-400"
        >
          &larr; Back
        </button>
        <div className="flex flex-col items-center gap-1">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            {selectedName?.charAt(0).toUpperCase()}
          </span>
          <h1 className="mt-2 text-xl font-semibold">{selectedName}</h1>
        </div>
        <div className="flex gap-3" aria-label="PIN entry">
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className={`h-4 w-4 rounded-full border border-brand-500/40 dark:border-brand-400/40 ${
                i < pin.length ? "bg-brand-500 dark:bg-brand-400" : ""
              }`}
            />
          ))}
        </div>
        {error && <p className="text-red-600">{error}</p>}
        <div className="grid grid-cols-3 gap-4">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              onClick={() => pressDigit(d)}
              disabled={loading}
              className="h-16 w-16 rounded-full border border-black/10 text-xl font-medium transition-colors active:border-brand-500/40 active:bg-brand-50 dark:border-white/10 dark:active:border-brand-400/30 dark:active:bg-brand-950/30"
            >
              {d}
            </button>
          ))}
          <button
            onClick={backspace}
            disabled={loading}
            className="h-16 w-16 rounded-full text-sm text-zinc-500 hover:text-brand-600 dark:hover:text-brand-400"
          >
            Delete
          </button>
          <button
            onClick={() => pressDigit("0")}
            disabled={loading}
            className="h-16 w-16 rounded-full border border-black/10 text-xl font-medium transition-colors active:border-brand-500/40 active:bg-brand-50 dark:border-white/10 dark:active:border-brand-400/30 dark:active:bg-brand-950/30"
          >
            0
          </button>
          <button
            onClick={submit}
            disabled={loading || pin.length < 4}
            className="h-16 w-16 rounded-full bg-gold-600 text-sm font-medium text-white transition-colors hover:bg-gold-700 disabled:opacity-30 dark:bg-gold-500 dark:text-black dark:hover:bg-gold-400"
          >
            {loading ? "..." : "Go"}
          </button>
        </div>
      </div>
    </div>
  );
}
