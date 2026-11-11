export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-40 animate-pulse rounded bg-line" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl border border-line bg-surface" />
        ))}
      </div>
    </div>
  );
}
