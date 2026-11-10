const FETCH_PAGE_SIZE = 1000;

// PostgREST caps an unbounded select() at this project's max_rows (1000) —
// it silently truncates rather than erroring, so a single .select() call
// only ever returns the first page once a table has more rows than that.
// Page through with .range() to get everything.
export async function fetchAllRows<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  let all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await query(from, from + FETCH_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    all = all.concat(data ?? []);
    if (!data || data.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }
  return all;
}
