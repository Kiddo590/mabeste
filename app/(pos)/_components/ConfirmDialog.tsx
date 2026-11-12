"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
type Pending = { options: ConfirmOptions; resolve: (value: boolean) => void };

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setPending({ options, resolve })),
    []
  );

  useEffect(() => {
    if (!pending) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        pending.resolve(false);
        setPending(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  function settle(value: boolean) {
    pending?.resolve(value);
    setPending(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => settle(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="w-full max-w-sm rounded-2xl border border-line bg-surface-raised p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-title" className="text-base font-semibold">
              {pending.options.title}
            </h2>
            {pending.options.message && <p className="mt-1 text-sm text-ink-muted">{pending.options.message}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                ref={cancelRef}
                onClick={() => settle(false)}
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-sunken"
              >
                {pending.options.cancelLabel ?? "Cancel"}
              </button>
              <button
                onClick={() => settle(true)}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
                  pending.options.danger
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-accent-600 hover:bg-accent-700 dark:bg-accent-500 dark:text-black dark:hover:bg-accent-400"
                }`}
              >
                {pending.options.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside ConfirmProvider");
  return ctx;
}
