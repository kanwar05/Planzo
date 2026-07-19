import jwt from "jsonwebtoken";
import Booking from "../models/Booking.js";
import CalendarConnection from "../models/CalendarConnection.js";
import Vendor from "../models/Vendor.js";
import {
  assertGoogleCalendarConfigured,
  getGoogleCalendarConfig,
  GOOGLE_CALENDAR_SCOPE,
} from "../config/googleCalendar.js";
import { decryptSecret, encryptSecret } from "../utils/tokenEncryption.js";

let requestOverride = null;
export const setGoogleCalendarRequestOverride = (handler) => {
  requestOverride = handler;
};

const googleRequest = async (url, options = {}) => {
  if (requestOverride) return requestOverride(url, options);
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      body?.error?.message || body?.error_description || "Google Calendar request failed.",
    );
    error.statusCode = response.status;
    throw error;
  }
  return body;
};

export function createGoogleAuthorizationUrl(user) {
  const config = assertGoogleCalendarConfigured();
  const state = jwt.sign(
    { sub: String(user._id), purpose: "google-calendar" },
    config.encryptionKey,
    { expiresIn: "10m", audience: "google-calendar-oauth" },
  );
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
    login_hint: user.email,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function verifyGoogleState(state) {
  const config = assertGoogleCalendarConfigured();
  const payload = jwt.verify(state, config.encryptionKey, {
    audience: "google-calendar-oauth",
  });
  if (payload.purpose !== "google-calendar") throw new Error("Invalid OAuth state.");
  return payload.sub;
}

const exchangeCode = (code) => {
  const config = assertGoogleCalendarConfigured();
  return googleRequest("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });
};

const accessTokenFor = async (connection) => {
  const config = assertGoogleCalendarConfigured();
  const refreshToken = decryptSecret(
    connection.refreshTokenEncrypted,
    config.encryptionKey,
  );
  const tokens = await googleRequest("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  return tokens.access_token;
};

export async function connectGoogleCalendar({ userId, code }) {
  const config = assertGoogleCalendarConfigured();
  const tokens = await exchangeCode(code);
  const existing = await CalendarConnection.findOne({ user: userId }).select(
    "+refreshTokenEncrypted",
  );
  const refreshToken = tokens.refresh_token
    ? encryptSecret(tokens.refresh_token, config.encryptionKey)
    : existing?.refreshTokenEncrypted;
  if (!refreshToken) {
    throw new Error("Google did not return a refresh token. Reconnect and grant consent.");
  }
  const profile = await googleRequest(
    "https://www.googleapis.com/calendar/v3/calendars/primary",
    { headers: { Authorization: `Bearer ${tokens.access_token}` } },
  );
  return CalendarConnection.findOneAndUpdate(
    { user: userId },
    {
      email: profile.id || "",
      calendarId: "primary",
      refreshTokenEncrypted: refreshToken,
      scopes: String(tokens.scope || GOOGLE_CALENDAR_SCOPE).split(" "),
      connectedAt: new Date(),
      syncEnabled: true,
      lastSyncError: "",
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

const eventIdFor = (booking) =>
  `planzo${String(booking._id).toLowerCase().replace(/[^a-v0-9]/g, "")}`;

export function bookingToGoogleEvent(booking) {
  const date = booking.eventDateOnly || new Date(booking.eventDate).toISOString().slice(0, 10);
  const timezone = booking.timezone || "Asia/Kolkata";
  const customer = booking.customerId;
  const vendor = booking.vendorId;
  return {
    id: booking.googleCalendarEventId || eventIdFor(booking),
    summary: `${booking.eventType} — Planzo`,
    description: [
      `Planzo booking ${booking._id}`,
      customer?.name ? `Customer: ${customer.name}` : "",
      booking.specialRequirements ? `Notes: ${booking.specialRequirements}` : "",
    ].filter(Boolean).join("\n"),
    location: booking.eventLocation,
    start: {
      dateTime: `${date}T${booking.eventStartTime || "09:00"}:00`,
      timeZone: timezone,
    },
    end: {
      dateTime: `${date}T${booking.eventEndTime || "10:00"}:00`,
      timeZone: timezone,
    },
    attendees: customer?.email ? [{ email: customer.email, displayName: customer.name }] : [],
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 24 * 60 },
        { method: "popup", minutes: 60 },
      ],
    },
    extendedProperties: {
      private: {
        planzoBookingId: String(booking._id),
        planzoVendorId: String(vendor?._id || vendor),
      },
    },
  };
}

const populatedBooking = (id) =>
  Booking.findById(id)
    .populate("customerId", "name email")
    .populate("vendorId", "businessName userId");

export async function syncBookingToGoogle(bookingOrId) {
  const booking = bookingOrId?.customerId?.email
    ? bookingOrId
    : await populatedBooking(bookingOrId?._id || bookingOrId);
  if (!booking) return { skipped: true };
  const vendorUserId = booking.vendorId?.userId;
  const connection = await CalendarConnection.findOne({
    user: vendorUserId,
    syncEnabled: true,
  }).select("+refreshTokenEncrypted");
  if (!connection) return { skipped: true };

  try {
    const token = await accessTokenFor(connection);
    const eventId = booking.googleCalendarEventId || eventIdFor(booking);
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendarId)}/events`;
    if (["cancelled", "rejected"].includes(booking.status)) {
      if (booking.googleCalendarEventId) {
        await googleRequest(`${base}/${encodeURIComponent(eventId)}?sendUpdates=all`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }).catch((error) => {
          if (error.statusCode !== 404 && error.statusCode !== 410) throw error;
        });
      }
      booking.googleCalendarEventId = null;
    } else if (["accepted", "completed"].includes(booking.status)) {
      const event = bookingToGoogleEvent(booking);
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      if (booking.googleCalendarEventId) {
        await googleRequest(`${base}/${encodeURIComponent(eventId)}?sendUpdates=all`, {
          method: "PUT",
          headers,
          body: JSON.stringify(event),
        });
      } else {
        try {
          await googleRequest(`${base}?sendUpdates=all`, {
            method: "POST",
            headers,
            body: JSON.stringify(event),
          });
        } catch (error) {
          // A retry after a lost response can find the deterministic event ID already used.
          if (error.statusCode !== 409) throw error;
          await googleRequest(`${base}/${encodeURIComponent(eventId)}?sendUpdates=all`, {
            method: "PUT",
            headers,
            body: JSON.stringify(event),
          });
        }
      }
      booking.googleCalendarEventId = eventId;
    } else {
      return { skipped: true };
    }
    booking.googleCalendarSyncedAt = new Date();
    booking.googleCalendarSyncError = "";
    await booking.save({ validateBeforeSave: false });
    return { synced: true };
  } catch (error) {
    booking.googleCalendarSyncError = String(error.message).slice(0, 500);
    await booking.save({ validateBeforeSave: false });
    throw error;
  }
}

export async function safeSyncBookingToGoogle(bookingOrId) {
  try {
    return await syncBookingToGoogle(bookingOrId);
  } catch (error) {
    console.error(`Google Calendar booking sync failed: ${error.message}`);
    return { synced: false, error: error.message };
  }
}

export async function syncVendorCalendar(userId) {
  const connection = await CalendarConnection.findOne({ user: userId }).select(
    "+refreshTokenEncrypted",
  );
  if (!connection) throw Object.assign(new Error("Connect Google Calendar first."), { statusCode: 409 });
  const vendor = await Vendor.findOne({ userId });
  if (!vendor) throw Object.assign(new Error("Vendor profile not found."), { statusCode: 404 });
  connection.lastSyncStatus = "syncing";
  await connection.save();
  const bookings = await Booking.find({
    vendorId: vendor._id,
    status: { $in: ["accepted", "completed", "cancelled"] },
  }).populate("customerId", "name email").populate("vendorId", "businessName userId");
  let synced = 0;
  const errors = [];
  for (const booking of bookings) {
    const result = await safeSyncBookingToGoogle(booking);
    if (result.synced) synced += 1;
    if (result.error) errors.push(result.error);
  }
  connection.lastSyncedAt = new Date();
  connection.lastSyncStatus = errors.length ? (synced ? "partial" : "error") : "success";
  connection.lastSyncError = errors[0] || "";
  await connection.save();
  return { synced, failed: errors.length, total: bookings.length };
}

export async function disconnectGoogleCalendar(userId) {
  const connection = await CalendarConnection.findOne({ user: userId }).select(
    "+refreshTokenEncrypted",
  );
  if (!connection) return false;
  const config = getGoogleCalendarConfig();
  const token = decryptSecret(connection.refreshTokenEncrypted, config.encryptionKey);
  await googleRequest(
    `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } },
  ).catch(() => {});
  await connection.deleteOne();
  return true;
}
