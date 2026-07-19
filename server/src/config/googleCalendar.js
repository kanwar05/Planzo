const required = (name) => String(process.env[name] || "").trim();

export const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";

export function getGoogleCalendarConfig() {
  return {
    clientId: required("GOOGLE_CALENDAR_CLIENT_ID"),
    clientSecret: required("GOOGLE_CALENDAR_CLIENT_SECRET"),
    redirectUri:
      required("GOOGLE_CALENDAR_REDIRECT_URI") ||
      "http://localhost:5001/api/calendar/google/callback",
    frontendUrl:
      required("CLIENT_URL").split(",")[0] || "http://localhost:5173",
    encryptionKey:
      required("GOOGLE_TOKEN_ENCRYPTION_KEY") || required("JWT_SECRET"),
  };
}

export function assertGoogleCalendarConfigured() {
  const config = getGoogleCalendarConfig();
  if (!config.clientId || !config.clientSecret || !config.encryptionKey) {
    const error = new Error("Google Calendar integration is not configured.");
    error.statusCode = 503;
    throw error;
  }
  return config;
}
