import { useEffect, useState } from "react";
import Button from "../components/Button";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Toast from "../components/Toast";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { getMyAvailability, updateAvailability } from "../services/availabilityService";
import { getApiError } from "../utils/apiError";
import { formatDate, todayDate } from "../utils/format";
export default function VendorAvailabilityPage() {
  useDocumentTitle("Date availability");
  const [availability, setAvailability] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [date, setDate] = useState("");
  useEffect(() => {
    getMyAvailability().then(data => setAvailability(data.availability)).catch(err => setError(getApiError(err, "Unable to load availability."))).finally(() => setLoading(false));
  }, []);
  const save = async unavailableDates => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setAvailability(await updateAvailability({
        unavailableDates,
        availableDates: (availability.availableDates || []).filter(item => !unavailableDates.includes(item))
      }));
      setMessage("Availability saved.");
      setDate("");
    } catch (err) {
      setError(getApiError(err, "Unable to save dates."));
    } finally {
      setBusy(false);
    }
  };
  const add = event => {
    event.preventDefault();
    if (availability.bookedDates?.includes(date)) {
      setError("This date already has an accepted booking.");
      return;
    }
    save([...new Set([...(availability.unavailableDates || []), date])].sort());
  };
  if (loading) return <LoadingSkeleton />;
  if (!availability) return <EmptyState title="Availability unavailable" description={error || "Create your business profile first."} actionTo="/vendor/profile-setup" actionLabel="Business profile" />;
  const blocked = availability.unavailableDates || [],
    booked = availability.bookedDates || [];
  return <div className="space-y-7">
    <Toast message={message} onClose={() => setMessage("")} />
    <header>
      <p className="text-xs font-bold uppercase tracking-wider text-coral">Plan your dates</p>
      <h1 className="mt-2 text-3xl font-extrabold">Date availability</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/55">Dates are available by default. Mark dates you cannot work. Accepted bookings reserve a date automatically.</p>
    </header>
    {error && <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">
      {error}
    </p>}
    <Card className="p-6">
      <h2 className="text-xl font-extrabold">Mark a date unavailable</h2>
      <form onSubmit={add} className="mt-5 flex flex-wrap items-end gap-3">
        <label>
          <span className="label">Date</span>
          <input required type="date" min={todayDate()} value={date} onChange={event => setDate(event.target.value)} className="field" />
        </label>
        <Button type="submit" disabled={busy} loading={busy}>Block date</Button>
      </form>
    </Card>
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="p-6">
        <h2 className="text-xl font-extrabold">Unavailable dates</h2>
        {blocked.length ? <ul className="mt-5 space-y-3">
          {blocked.map(item => <li key={item} className="flex items-center justify-between gap-3 rounded-2xl border p-3">
            <span className="text-sm">
              {formatDate(item)}
            </span>
            <Button variant="ghost" disabled={busy} onClick={() => save(blocked.filter(value => value !== item))}>Make available</Button>
          </li>)}
        </ul> : <p className="mt-5 text-sm text-ink/55">No dates blocked.</p>}
      </Card>
      <Card className="p-6">
        <h2 className="text-xl font-extrabold">Booked dates</h2>
        {booked.length ? <ul className="mt-5 space-y-3">
          {booked.map(item => <li key={item} className="rounded-2xl bg-sage/10 p-3 text-sm">
            {formatDate(item)}
          </li>)}
        </ul> : <p className="mt-5 text-sm text-ink/55">No reserved dates yet.</p>}
      </Card>
    </div>
  </div>;
}
