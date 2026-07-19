import CalendarConnection from "../models/CalendarConnection.js";
import { syncVendorCalendar } from "../services/googleCalendarService.js";

const DEFAULT_INTERVAL_MS =
  Number(process.env.CALENDAR_SYNC_INTERVAL_MS) || 15 * 60 * 1000;

export async function runCalendarSyncJob() {
  const connections = await CalendarConnection.find({ syncEnabled: true }).select("user");
  const results = { synced: 0, failed: 0 };
  for (const connection of connections) {
    try {
      await syncVendorCalendar(connection.user);
      results.synced += 1;
    } catch (error) {
      results.failed += 1;
      console.error(`Scheduled Google Calendar sync failed: ${error.message}`);
    }
  }
  return results;
}

export function startCalendarSyncScheduler() {
  if (process.env.NODE_ENV === "test") return null;
  const interval = setInterval(() => {
    runCalendarSyncJob().catch((error) =>
      console.error(`Google Calendar sync job failed: ${error.message}`),
    );
  }, DEFAULT_INTERVAL_MS);
  return interval;
}
