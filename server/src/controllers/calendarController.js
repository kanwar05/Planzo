import Booking from "../models/Booking.js";
import CalendarConnection from "../models/CalendarConnection.js";
import Vendor from "../models/Vendor.js";
import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import {
  connectGoogleCalendar,
  createGoogleAuthorizationUrl,
  disconnectGoogleCalendar,
  syncVendorCalendar,
  verifyGoogleState,
} from "../services/googleCalendarService.js";
import { getGoogleCalendarConfig } from "../config/googleCalendar.js";

const escapeIcs = (value = "") =>
  String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");

const icsDate = (date, time = "00:00") =>
  `${date.replaceAll("-", "")}T${time.replace(":", "")}00`;

export const getCalendarStatus = asyncHandler(async (req, res) => {
  const connection = await CalendarConnection.findOne({ user: req.user._id });
  res.json({
    success: true,
    configured: Boolean(
      process.env.GOOGLE_CALENDAR_CLIENT_ID &&
        process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    ),
    connected: Boolean(connection),
    connection: connection
      ? {
          email: connection.email,
          connectedAt: connection.connectedAt,
          lastSyncedAt: connection.lastSyncedAt,
          lastSyncStatus: connection.lastSyncStatus,
          lastSyncError: connection.lastSyncError,
          syncEnabled: connection.syncEnabled,
        }
      : null,
  });
});

export const beginGoogleOAuth = asyncHandler(async (req, res) => {
  res.json({ success: true, authorizationUrl: createGoogleAuthorizationUrl(req.user) });
});

export const googleOAuthCallback = asyncHandler(async (req, res) => {
  const config = getGoogleCalendarConfig();
  const destination = new URL("/vendor/calendar", config.frontendUrl);
  try {
    if (req.query.error) throw new Error("Google Calendar access was not granted.");
    if (!req.query.code || !req.query.state) throw new Error("Missing OAuth callback parameters.");
    const userId = verifyGoogleState(req.query.state);
    await connectGoogleCalendar({ userId, code: req.query.code });
    await syncVendorCalendar(userId);
    destination.searchParams.set("google", "connected");
  } catch (error) {
    destination.searchParams.set("google", "error");
    destination.searchParams.set("message", String(error.message).slice(0, 160));
  }
  res.redirect(destination.toString());
});

export const syncGoogleCalendar = asyncHandler(async (req, res) => {
  const result = await syncVendorCalendar(req.user._id);
  res.json({ success: true, message: "Calendar sync completed.", ...result });
});

export const disconnectCalendar = asyncHandler(async (req, res) => {
  await disconnectGoogleCalendar(req.user._id);
  res.json({ success: true, message: "Google Calendar disconnected." });
});

export const exportBookings = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findOne({ userId: req.user._id });
  if (!vendor) throw new ApiError(404, "Vendor profile not found.");
  const bookings = await Booking.find({
    vendorId: vendor._id,
    status: { $in: ["accepted", "completed"] },
  }).populate("customerId", "name email").sort({ eventDate: 1 });
  const events = bookings.map((booking) => {
    const date = booking.eventDateOnly || booking.eventDate.toISOString().slice(0, 10);
    return [
      "BEGIN:VEVENT",
      `UID:planzo-${booking._id}@planzo`,
      `DTSTAMP:${new Date().toISOString().replaceAll(/[-:]/g, "").replace(".000", "")}`,
      `DTSTART;TZID=${escapeIcs(booking.timezone || "Asia/Kolkata")}:${icsDate(date, booking.eventStartTime || "09:00")}`,
      `DTEND;TZID=${escapeIcs(booking.timezone || "Asia/Kolkata")}:${icsDate(date, booking.eventEndTime || "10:00")}`,
      `SUMMARY:${escapeIcs(`${booking.eventType} — Planzo`)}`,
      `LOCATION:${escapeIcs(booking.eventLocation)}`,
      `DESCRIPTION:${escapeIcs(`Customer: ${booking.customerId?.name || "Customer"}\\nBooking: ${booking._id}`)}`,
      "END:VEVENT",
    ].join("\r\n");
  });
  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Planzo//Bookings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  res
    .set({
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="planzo-bookings.ics"',
    })
    .send(calendar);
});
