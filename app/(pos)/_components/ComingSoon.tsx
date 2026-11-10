export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="h-8 w-8 text-amber-600 dark:text-amber-400"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="max-w-sm text-zinc-500">{description}</p>
    </div>
  );
}
