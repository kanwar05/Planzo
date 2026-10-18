export default function BookingMetrics({
  bookings
}) {
  return <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
    {[["Total bookings", bookings.length], ["Pending bookings", bookings.filter(item => item.status === "pending").length], ["Accepted bookings", bookings.filter(item => item.status === "accepted").length], ["Completed bookings", bookings.filter(item => item.status === "completed").length]].map(([label, count]) => <div key={label} className="rounded-3xl border border-ink/8 bg-white p-5 shadow-soft">
      <p className="text-sm text-ink/55">
        {label}
      </p>
      <p className="mt-3 text-3xl font-extrabold">
        {count}
      </p>
    </div>)}
  </div>;
}
