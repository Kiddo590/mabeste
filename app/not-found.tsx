import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="text-sm text-ink-muted">That page doesn&apos;t exist or has moved.</p>
      <Link
        href="/"
        className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
      >
        Go home
      </Link>
    </div>
  );
}
