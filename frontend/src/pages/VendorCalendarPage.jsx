import {
  CalendarCheck,
  CheckCircle2,
  Download,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Button from "../components/Button";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Toast from "../components/Toast";
import { getVendorRequests } from "../services/bookingService";
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  exportCalendar,
  getCalendarStatus,
  syncGoogleCalendar,
} from "../services/calendarService";
import { getApiError } from "../utils/apiError";

const formatDate = (value) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));

export default function VendorCalendarPage() {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [calendar, allBookings] = await Promise.all([
        getCalendarStatus(),
        getVendorRequests(),
      ]);
      setStatus(calendar);
      setBookings(
        allBookings.filter((booking) =>
          ["accepted", "completed"].includes(booking.status),
        ),
      );
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to load calendar."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const result = params.get("google");
    if (result === "connected") setMessage("Google Calendar connected and synced.");
    if (result === "error") setError(params.get("message") || "Google connection failed.");
    if (result) {
      params.delete("google");
      params.delete("message");
      setParams(params, { replace: true });
    }
    load();
  }, []);

  const upcoming = useMemo(
    () =>
      bookings
        .filter((booking) => new Date(booking.eventDate) >= new Date())
        .sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate)),
    [bookings],
  );

  const sync = async () => {
    setBusy("sync");
    try {
      const result = await syncGoogleCalendar();
      setMessage(`Synced ${result.synced} of ${result.total} bookings.`);
      await load();
    } catch (requestError) {
      setError(getApiError(requestError, "Calendar sync failed."));
    } finally {
      setBusy("");
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect Google Calendar? Existing calendar events will remain.")) return;
    setBusy("disconnect");
    try {
      await disconnectGoogleCalendar();
      setMessage("Google Calendar disconnected.");
      await load();
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to disconnect calendar."));
    } finally {
      setBusy("");
    }
  };

  if (loading) return <div className="p-6"><LoadingSkeleton /></div>;

  return (
    <section className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Toast message={error} type="error" onClose={() => setError("")} />
      <Toast message={message} type="success" onClose={() => setMessage("")} />
      <div>
        <h1 className="text-3xl font-extrabold">Calendar</h1>
        <p className="mt-1 text-sm text-ink/55">
          Keep accepted Planzo bookings and customer reminders in sync.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
        <article className="rounded-3xl border bg-white p-6 shadow-soft">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                <CalendarCheck />
              </span>
              <div>
                <h2 className="text-lg font-bold">Google Calendar</h2>
                <p className="text-sm text-ink/50">
                  {status?.connected
                    ? `Connected as ${status.connection.email || "Google account"}`
                    : "Not connected"}
                </p>
              </div>
            </div>
            {status?.connected ? (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Connected
              </span>
            ) : (
              <Button
                onClick={connectGoogleCalendar}
                disabled={!status?.configured}
              >
                Connect Google
              </Button>
            )}
          </div>

          {!status?.configured && (
            <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">
              Google Calendar credentials have not been configured by the administrator.
            </p>
          )}

          {status?.connected && (
            <>
              <dl className="mt-6 grid gap-4 rounded-2xl bg-sand/35 p-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-ink/45">Last sync</dt>
                  <dd className="mt-1 font-semibold">
                    {status.connection.lastSyncedAt
                      ? new Date(status.connection.lastSyncedAt).toLocaleString()
                      : "Not synced yet"}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink/45">Status</dt>
                  <dd className="mt-1 font-semibold capitalize">
                    {status.connection.lastSyncStatus}
                  </dd>
                </div>
              </dl>
              {status.connection.lastSyncError && (
                <p className="mt-3 text-sm text-red-600">{status.connection.lastSyncError}</p>
              )}
              <div className="mt-5 flex flex-wrap gap-3">
                <Button onClick={sync} loading={busy === "sync"}>
                  <RefreshCw className="h-4 w-4" /> Sync now
                </Button>
                <Button variant="outline" onClick={disconnect} disabled={Boolean(busy)}>
                  <Unplug className="h-4 w-4" /> Disconnect
                </Button>
              </div>
            </>
          )}
        </article>

        <article className="rounded-3xl border bg-white p-6 shadow-soft">
          <h2 className="text-lg font-bold">Portable export</h2>
          <p className="mt-2 text-sm leading-6 text-ink/55">
            Download all accepted and completed bookings as an ICS file for Apple
            Calendar, Outlook, or another calendar app.
          </p>
          <Button variant="outline" className="mt-5" onClick={exportCalendar}>
            <Download className="h-4 w-4" /> Export bookings
          </Button>
        </article>
      </div>

      <article className="overflow-hidden rounded-3xl border bg-white shadow-soft">
        <div className="border-b p-5">
          <h2 className="text-lg font-bold">Upcoming synced bookings</h2>
          <p className="text-sm text-ink/45">{upcoming.length} upcoming events</p>
        </div>
        <div className="divide-y">
          {upcoming.length ? upcoming.map((booking) => (
            <div key={booking._id} className="grid gap-2 p-5 sm:grid-cols-[1fr_auto]">
              <div>
                <h3 className="font-bold">{booking.eventType}</h3>
                <p className="text-sm text-ink/50">
                  {booking.customerId?.name} · {booking.eventLocation}
                </p>
              </div>
              <div className="text-sm sm:text-right">
                <p className="font-semibold">{formatDate(booking.eventDate)}</p>
                <p className="text-ink/45">
                  {booking.eventStartTime}–{booking.eventEndTime}
                </p>
              </div>
            </div>
          )) : (
            <p className="p-8 text-center text-sm text-ink/45">
              Accepted bookings will appear here.
            </p>
          )}
        </div>
      </article>
    </section>
  );
}
