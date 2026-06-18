export default function LoadingSkeleton() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((item) => (
        <div key={item} className="overflow-hidden rounded-[1.75rem] border bg-white p-4">
          <div className="h-52 animate-pulse rounded-2xl bg-sand" />
          <div className="mt-5 h-4 w-1/3 animate-pulse rounded bg-sand" />
          <div className="mt-3 h-6 w-2/3 animate-pulse rounded bg-sand" />
          <div className="mt-6 h-10 animate-pulse rounded-xl bg-sand" />
        </div>
      ))}
    </div>
  );
}
