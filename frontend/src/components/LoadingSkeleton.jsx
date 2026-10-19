export default function LoadingSkeleton({ count = 6 }) {
  return (
    <div role="status" aria-label="Loading content" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, index) => index).map((item) => (
        <div key={item} aria-hidden="true" className="overflow-hidden rounded-2xl border bg-white p-4">
          <div className="h-52 animate-pulse rounded-2xl bg-sand" />
          <div className="mt-5 h-4 w-1/3 animate-pulse rounded bg-sand" />
          <div className="mt-3 h-6 w-2/3 animate-pulse rounded bg-sand" />
          <div className="mt-6 h-10 animate-pulse rounded-xl bg-sand" />
        </div>
      ))}
    </div>
  );
}
