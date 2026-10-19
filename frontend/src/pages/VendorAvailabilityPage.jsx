import { useCallback, useEffect, useState } from "react";
import { CalendarCheck2, CalendarDays, CalendarX2, Plus } from "lucide-react";
import Button from "../components/Button";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Toast from "../components/Toast";
import { WorkspaceError, WorkspaceHeader, WorkspaceSectionTitle } from "../components/dashboard/WorkspacePageParts";
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
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getMyAvailability();
      setAvailability(data.availability);
    } catch (err) {
      setError(getApiError(err, "Unable to load availability."));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  const save = async unavailableDates => {
    if (busy) return;
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
    if (!date || busy) return;
    if (availability.bookedDates?.includes(date)) {
      setError("This date already has an accepted booking.");
      return;
    }
    save([...new Set([...(availability.unavailableDates || []), date])].sort());
  };
  const blocked = availability?.unavailableDates || [],
    booked = availability?.bookedDates || [];
  return <div className="space-y-6 sm:space-y-8">
    <Toast message={message} onClose={() => setMessage("")} />
    <WorkspaceHeader eyebrow="Plan your dates" title="Date availability" description="Make room for your next celebration. Keep customers informed about the dates you can work." />
    <WorkspaceError message={error} onRetry={!availability ? load : undefined} />
    {loading ? <LoadingSkeleton /> : !availability ? <EmptyState title="Availability unavailable" description={error || "Create your business profile first."} actionTo="/vendor/profile-setup" actionLabel="Business profile" /> : <>
    <div className="flex items-start gap-3 rounded-2xl bg-sage p-4 text-sm leading-6 text-ink sm:p-5">
      <CalendarCheck2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <p>Dates are available by default. Mark dates you cannot work. Accepted bookings reserve a date automatically.</p>
    </div>
    <Card className="p-5 sm:p-7">
      <WorkspaceSectionTitle icon={CalendarDays} title="Mark a date unavailable" description="Taking time off or booked elsewhere? Block the date here." />
      <form onSubmit={add} className="mt-6 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:max-w-xl">
        <label className="block min-w-0">
          <span className="label">Date</span>
          <input required type="date" min={todayDate()} value={date} onChange={event => setDate(event.target.value)} disabled={busy} className="field min-w-0" />
        </label>
        <Button type="submit" disabled={busy} loading={busy}><Plus className="h-4 w-4" aria-hidden="true" /> Block date</Button>
      </form>
    </Card>
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="min-w-0 p-5 sm:p-7">
        <WorkspaceSectionTitle icon={CalendarX2} title="Unavailable dates" aside={<span className="rounded-full bg-sand px-3 py-1 text-xs font-bold tabular-nums">{blocked.length}</span>} />
        {blocked.length ? <ul className="mt-6 divide-y divide-ink/10">
          {blocked.map(item => <li key={item} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3">
            <span className="text-sm font-semibold">
              {formatDate(item)}
            </span>
            <Button variant="ghost" disabled={busy} onClick={() => save(blocked.filter(value => value !== item))} aria-label={`Make ${formatDate(item)} available`} className="!px-2 !text-coral">Make available</Button>
          </li>)}
        </ul> : <div className="mt-6 rounded-2xl bg-sand/70 p-5"><p className="text-sm font-bold">No dates blocked.</p><p className="mt-2 text-sm leading-6 text-ink/65">Your calendar is open for new requests.</p></div>}
      </Card>
      <Card className="min-w-0 p-5 sm:p-7">
        <WorkspaceSectionTitle icon={CalendarCheck2} title="Booked dates" aside={<span className="rounded-full bg-sage px-3 py-1 text-xs font-bold tabular-nums">{booked.length}</span>} />
        {booked.length ? <ul className="mt-6 space-y-3">
          {booked.map(item => <li key={item} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-sage/60 p-4 text-sm font-semibold">
            <span>{formatDate(item)}</span><span className="text-xs font-medium text-ink/65">Reserved</span>
          </li>)}
        </ul> : <div className="mt-6 rounded-2xl bg-sand/70 p-5"><p className="text-sm font-bold">No reserved dates yet.</p><p className="mt-2 text-sm leading-6 text-ink/65">Dates appear here when you accept a booking.</p></div>}
      </Card>
    </div>
    </>}
  </div>;
}
