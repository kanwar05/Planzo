import "react-big-calendar/lib/css/react-big-calendar.css";

import {
  Ban,
  CalendarOff,
  Clock3,
  Plane,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, getDay, parse, startOfWeek } from "date-fns";
import enUS from "date-fns/locale/en-US";
import Button from "../components/Button";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Toast from "../components/Toast";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import {
  deleteAvailabilityItem,
  getVendorAvailability,
  updateAvailability,
} from "../services/availabilityService";
import { getMyVendorProfile } from "../services/vendorService";
import { getApiError } from "../utils/apiError";

const locales = { "en-US": enUS };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const defaultHours = [
  { dayOfWeek: 0, isOpen: false, startTime: "10:00", endTime: "18:00" },
  { dayOfWeek: 1, isOpen: true, startTime: "10:00", endTime: "18:00" },
  { dayOfWeek: 2, isOpen: true, startTime: "10:00", endTime: "18:00" },
  { dayOfWeek: 3, isOpen: true, startTime: "10:00", endTime: "18:00" },
  { dayOfWeek: 4, isOpen: true, startTime: "10:00", endTime: "18:00" },
  { dayOfWeek: 5, isOpen: true, startTime: "10:00", endTime: "18:00" },
  { dayOfWeek: 6, isOpen: true, startTime: "10:00", endTime: "16:00" },
];

const today = () => new Date().toISOString().slice(0, 10);
const asDate = (date) => new Date(`${date}T00:00:00`);
const addDays = (date, days) => {
  const next = asDate(date);
  next.setDate(next.getDate() + days);
  return next;
};

export default function VendorAvailabilityPage() {
  useDocumentTitle("Vendor availability");
  const [vendor, setVendor] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [blockedDateForm, setBlockedDateForm] = useState({
    date: today(),
    reason: "",
    type: "blocked",
  });
  const [slotForm, setSlotForm] = useState({
    date: today(),
    startTime: "10:00",
    endTime: "11:00",
    reason: "",
  });
  const [vacationForm, setVacationForm] = useState({
    startDate: today(),
    endDate: today(),
    reason: "",
  });

  useEffect(() => {
    getMyVendorProfile()
      .then(async (profile) => {
        setVendor(profile);
        const response = await getVendorAvailability(profile._id);
        setAvailability(response.availability);
      })
      .catch((requestError) =>
        setError(
          getApiError(requestError, "Unable to load availability settings."),
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const businessHours = availability?.businessHours?.length
    ? availability.businessHours
    : defaultHours;

  const events = useMemo(() => {
    if (!availability) return [];

    const dateBlocks = availability.blockedDates.map((item) => ({
      id: item._id,
      title:
        item.type === "holiday"
          ? item.reason || "Holiday"
          : item.reason || "Blocked date",
      start: asDate(item.date),
      end: addDays(item.date, 1),
      allDay: true,
      resource: { kind: item.type },
    }));
    const slotBlocks = availability.blockedTimeSlots.map((item) => ({
      id: item._id,
      title: item.reason || "Blocked slot",
      start: new Date(`${item.date}T${item.startTime}:00`),
      end: new Date(`${item.date}T${item.endTime}:00`),
      resource: { kind: "slot" },
    }));
    const vacations = availability.vacations.map((item) => ({
      id: item._id,
      title: item.reason || "Vacation",
      start: asDate(item.startDate),
      end: addDays(item.endDate, 1),
      allDay: true,
      resource: { kind: "vacation" },
    }));

    return [...dateBlocks, ...slotBlocks, ...vacations];
  }, [availability]);

  const saveSettings = async (updates, label = "settings") => {
    setSaving(label);
    setError("");
    setSuccess("");
    try {
      const updated = await updateAvailability(updates);
      setAvailability(updated);
      setSuccess("Availability updated.");
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to save availability."));
    } finally {
      setSaving("");
    }
  };

  const updateBusinessHour = (dayOfWeek, field, value) => {
    const next = businessHours.map((item) =>
      item.dayOfWeek === dayOfWeek ? { ...item, [field]: value } : item,
    );
    setAvailability((current) => ({ ...current, businessHours: next }));
  };

  const addBlockedDate = (event) => {
    event.preventDefault();
    const next = [
      ...(availability?.blockedDates || []),
      {
        ...blockedDateForm,
        reason:
          blockedDateForm.reason ||
          (blockedDateForm.type === "holiday" ? "Holiday" : "Blocked date"),
      },
    ];
    saveSettings({ blockedDates: next }, "blocked-date");
    setBlockedDateForm({ date: today(), reason: "", type: "blocked" });
  };

  const addBlockedSlot = (event) => {
    event.preventDefault();
    const next = [
      ...(availability?.blockedTimeSlots || []),
      { ...slotForm, reason: slotForm.reason || "Blocked slot" },
    ];
    saveSettings({ blockedTimeSlots: next }, "slot");
    setSlotForm({
      date: today(),
      startTime: "10:00",
      endTime: "11:00",
      reason: "",
    });
  };

  const addVacation = (event) => {
    event.preventDefault();
    const next = [
      ...(availability?.vacations || []),
      { ...vacationForm, reason: vacationForm.reason || "Vacation" },
    ];
    saveSettings({ vacations: next }, "vacation");
    setVacationForm({ startDate: today(), endDate: today(), reason: "" });
  };

  const removeItem = async (type, id) => {
    setSaving(id);
    setError("");
    setSuccess("");
    try {
      const updated = await deleteAvailabilityItem({ type, id });
      setAvailability(updated);
      setSuccess("Availability item removed.");
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to remove this item."));
    } finally {
      setSaving("");
    }
  };

  const eventPropGetter = (event) => {
    const kind = event.resource?.kind;
    const backgroundColor =
      kind === "holiday"
        ? "#d97706"
        : kind === "vacation"
          ? "#475569"
          : kind === "slot"
            ? "#dc2626"
            : "#ee7668";

    return {
      style: {
        backgroundColor,
        borderColor: "transparent",
        borderRadius: "10px",
        color: "white",
        fontWeight: 700,
      },
    };
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (!vendor || !availability) {
    return (
      <EmptyState
        title="Availability unavailable"
        description={error || "Create your vendor profile before scheduling."}
      />
    );
  }

  return (
    <div className="space-y-8">
      <Toast
        message={error || success}
        type={error ? "error" : "success"}
        onClose={() => {
          setError("");
          setSuccess("");
        }}
      />

      <section className="rounded-[2rem] border bg-white p-6 shadow-soft sm:p-8">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-coral">
              Availability center
            </p>
            <h1 className="mt-2 text-3xl font-extrabold">
              Control when customers can book you.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/55">
              Manage recurring business hours, holidays, vacations, and blocked
              slots for {vendor.businessName}.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="label">Timezone</span>
              <input
                value={availability.timezone || "Asia/Kolkata"}
                onChange={(event) =>
                  setAvailability((current) => ({
                    ...current,
                    timezone: event.target.value,
                  }))
                }
                className="field"
              />
            </label>
            <label>
              <span className="label">Slot duration</span>
              <select
                value={availability.slotDurationMinutes || 60}
                onChange={(event) =>
                  setAvailability((current) => ({
                    ...current,
                    slotDurationMinutes: Number(event.target.value),
                  }))
                }
                className="field"
              >
                {[30, 45, 60, 90, 120, 180, 240].map((item) => (
                  <option key={item} value={item}>
                    {item} minutes
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            onClick={() =>
              saveSettings(
                {
                  timezone: availability.timezone,
                  slotDurationMinutes: availability.slotDurationMinutes,
                },
                "top-settings",
              )
            }
            loading={saving === "top-settings"}
          >
            <Save className="h-4 w-4" /> Save settings
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              setAvailability((current) => ({
                ...current,
                businessHours: defaultHours,
              }))
            }
          >
            <RotateCcw className="h-4 w-4" /> Reset hours
          </Button>
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden p-4 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-extrabold">Calendar</h2>
              <p className="mt-1 text-sm text-ink/45">
                Blocked dates, holidays, vacations, and unavailable slots.
              </p>
            </div>
          </div>
          <div className="h-[620px] rounded-2xl bg-white">
            <Calendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              views={["month", "week", "day", "agenda"]}
              eventPropGetter={eventPropGetter}
              popup
            />
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-extrabold">
              <Ban className="h-5 w-5 text-coral" /> Block a date
            </h2>
            <form onSubmit={addBlockedDate} className="mt-5 grid gap-3">
              <input
                required
                type="date"
                min={today()}
                value={blockedDateForm.date}
                onChange={(event) =>
                  setBlockedDateForm((current) => ({
                    ...current,
                    date: event.target.value,
                  }))
                }
                className="field"
              />
              <select
                value={blockedDateForm.type}
                onChange={(event) =>
                  setBlockedDateForm((current) => ({
                    ...current,
                    type: event.target.value,
                  }))
                }
                className="field"
              >
                <option value="blocked">Blocked date</option>
                <option value="holiday">Holiday</option>
              </select>
              <input
                value={blockedDateForm.reason}
                onChange={(event) =>
                  setBlockedDateForm((current) => ({
                    ...current,
                    reason: event.target.value,
                  }))
                }
                className="field"
                placeholder="Reason"
              />
              <Button loading={saving === "blocked-date"} disabled={Boolean(saving)}>
                <Plus className="h-4 w-4" /> Add date
              </Button>
            </form>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-extrabold">
              <Clock3 className="h-5 w-5 text-coral" /> Block a time slot
            </h2>
            <form onSubmit={addBlockedSlot} className="mt-5 grid gap-3">
              <input
                required
                type="date"
                min={today()}
                value={slotForm.date}
                onChange={(event) =>
                  setSlotForm((current) => ({
                    ...current,
                    date: event.target.value,
                  }))
                }
                className="field"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  required
                  type="time"
                  value={slotForm.startTime}
                  onChange={(event) =>
                    setSlotForm((current) => ({
                      ...current,
                      startTime: event.target.value,
                    }))
                  }
                  className="field"
                />
                <input
                  required
                  type="time"
                  value={slotForm.endTime}
                  onChange={(event) =>
                    setSlotForm((current) => ({
                      ...current,
                      endTime: event.target.value,
                    }))
                  }
                  className="field"
                />
              </div>
              <input
                value={slotForm.reason}
                onChange={(event) =>
                  setSlotForm((current) => ({
                    ...current,
                    reason: event.target.value,
                  }))
                }
                className="field"
                placeholder="Reason"
              />
              <Button loading={saving === "slot"} disabled={Boolean(saving)}>
                <Plus className="h-4 w-4" /> Add slot
              </Button>
            </form>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-extrabold">
              <Plane className="h-5 w-5 text-coral" /> Add vacation
            </h2>
            <form onSubmit={addVacation} className="mt-5 grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  required
                  type="date"
                  min={today()}
                  value={vacationForm.startDate}
                  onChange={(event) =>
                    setVacationForm((current) => ({
                      ...current,
                      startDate: event.target.value,
                    }))
                  }
                  className="field"
                />
                <input
                  required
                  type="date"
                  min={vacationForm.startDate}
                  value={vacationForm.endDate}
                  onChange={(event) =>
                    setVacationForm((current) => ({
                      ...current,
                      endDate: event.target.value,
                    }))
                  }
                  className="field"
                />
              </div>
              <input
                value={vacationForm.reason}
                onChange={(event) =>
                  setVacationForm((current) => ({
                    ...current,
                    reason: event.target.value,
                  }))
                }
                className="field"
                placeholder="Reason"
              />
              <Button loading={saving === "vacation"} disabled={Boolean(saving)}>
                <Plus className="h-4 w-4" /> Add vacation
              </Button>
            </form>
          </Card>
        </div>
      </div>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-xl font-extrabold">Weekly business hours</h2>
            <p className="mt-1 text-sm text-ink/45">
              These recurring hours generate customer booking slots.
            </p>
          </div>
          <Button
            onClick={() =>
              saveSettings({ businessHours: availability.businessHours }, "hours")
            }
            loading={saving === "hours"}
          >
            <Save className="h-4 w-4" /> Save hours
          </Button>
        </div>
        <div className="mt-6 grid gap-3">
          {businessHours.map((item) => (
            <div
              key={item.dayOfWeek}
              className="grid items-center gap-3 rounded-2xl border bg-white p-4 md:grid-cols-[90px_120px_1fr_1fr]"
            >
              <p className="font-extrabold">{dayLabels[item.dayOfWeek]}</p>
              <label className="flex items-center gap-2 text-sm font-bold text-ink/60">
                <input
                  type="checkbox"
                  checked={item.isOpen}
                  onChange={(event) =>
                    updateBusinessHour(
                      item.dayOfWeek,
                      "isOpen",
                      event.target.checked,
                    )
                  }
                />
                Open
              </label>
              <input
                type="time"
                value={item.startTime}
                disabled={!item.isOpen}
                onChange={(event) =>
                  updateBusinessHour(
                    item.dayOfWeek,
                    "startTime",
                    event.target.value,
                  )
                }
                className="field"
              />
              <input
                type="time"
                value={item.endTime}
                disabled={!item.isOpen}
                onChange={(event) =>
                  updateBusinessHour(
                    item.dayOfWeek,
                    "endTime",
                    event.target.value,
                  )
                }
                className="field"
              />
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <AvailabilityList
          title="Blocked dates"
          icon={CalendarOff}
          items={availability.blockedDates}
          getMeta={(item) => `${item.date} · ${item.type}`}
          onDelete={(item) => removeItem("blockedDate", item._id)}
          saving={saving}
        />
        <AvailabilityList
          title="Blocked slots"
          icon={Clock3}
          items={availability.blockedTimeSlots}
          getMeta={(item) => `${item.date} · ${item.startTime}-${item.endTime}`}
          onDelete={(item) => removeItem("blockedTimeSlot", item._id)}
          saving={saving}
        />
        <AvailabilityList
          title="Vacations"
          icon={Plane}
          items={availability.vacations}
          getMeta={(item) => `${item.startDate} to ${item.endDate}`}
          onDelete={(item) => removeItem("vacation", item._id)}
          saving={saving}
        />
      </div>
    </div>
  );
}

function AvailabilityList({ title, icon: Icon, items, getMeta, onDelete, saving }) {
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-lg font-extrabold">
        <Icon className="h-5 w-5 text-coral" /> {title}
      </h2>
      <div className="mt-4 space-y-3">
        {items?.length ? (
          items.map((item) => (
            <div
              key={item._id}
              className="flex items-center justify-between gap-3 rounded-2xl border bg-white p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">
                  {item.reason || "Unavailable"}
                </p>
                <p className="mt-1 text-xs text-ink/45">{getMeta(item)}</p>
              </div>
              <button
                type="button"
                onClick={() => onDelete(item)}
                disabled={saving === item._id}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-50 text-red-600 disabled:opacity-50"
                title="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        ) : (
          <p className="rounded-2xl bg-sand/60 p-4 text-sm text-ink/45">
            No items yet.
          </p>
        )}
      </div>
    </Card>
  );
}
