import "dotenv/config";
import mongoose from "mongoose";
import { validateEnvironment } from "./src/config/environment.js";
import { assertCanonicalBookingDates, assertBookingReservationFields } from "./src/utils/bookingDataAudit.js";
import { assertRequiredIndexes } from "./src/utils/databasePreflight.js";
import { errorCategory, logEvent } from "./src/utils/logger.js";

const safeStartupCodes = new Set(["DB_TOPOLOGY_UNSUPPORTED", "DB_VERSION_UNSUPPORTED", "DB_UNAVAILABLE", "PREFLIGHT_INDEX_INVALID", "BOOKING_DATES_UNSAFE", "BOOKING_RESERVATIONS_UNSAFE"]);

async function startServer() {
  let phase = "configuration";
  try {
    validateEnvironment();
    const [{ default: app }, { default: connectDatabase }, ...models] =
      await Promise.all([
        import("./src/app.js"),
        import("./src/config/database.js"),
        ...["Booking", "User", "Vendor", "Availability", "RefreshToken", "EmailOtp", "NotificationOutbox", "VendorModerationAudit"].map(
          (model) => import(`./src/models/${model}.js`),
        ),
      ]);
    phase = "database";
    await connectDatabase();
    phase = "booking_dates";
    await assertCanonicalBookingDates();
    await assertBookingReservationFields();
    // Add required indexes without dropping legacy indexes or data.
    // Conflicting legacy reservations must be resolved before deployment.
    phase = "indexes";
    await Promise.all(
      models.map(({ default: model }) => model.createIndexes()),
    );
    await assertRequiredIndexes();
    app.locals.shuttingDown = false;
    for (const event of ["disconnected", "reconnected", "error"]) {
      mongoose.connection.on(event, () => logEvent(event === "error" ? "error" : "warn", `database_${event}`));
    }
    const port = Number(process.env.PORT) || 5001;
    const server = app.listen(port, () =>
      logEvent("info", "api_listening", { port }),
    );
    server.on("error", async (error) => {
      logEvent("error", "api_server_failed", { category: errorCategory(error) });
      try { await mongoose.disconnect(); }
      catch { logEvent("error", "database_cleanup_failed"); }
      finally { process.exitCode = 1; }
    });
    let closing = false;
    const shutdown = () => {
      if (closing) return;
      closing = true;
      app.locals.shuttingDown = true;
      logEvent("info", "api_shutdown_started");
      const deadline = setTimeout(() => {
        logEvent("error", "api_shutdown_deadline");
        process.exit(1);
      }, 25000);
      deadline.unref();
      server.close(async () => {
        try {
          await mongoose.disconnect();
          logEvent("info", "api_shutdown_finished");
        } catch {
          logEvent("error", "api_shutdown_failed");
          process.exitCode = 1;
        } finally { clearTimeout(deadline); }
      });
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    logEvent("error", "api_startup_failed", { phase, category: safeStartupCodes.has(error.code) ? error.code : errorCategory(error) });
    try { await mongoose.disconnect(); }
    catch { logEvent("error", "database_cleanup_failed"); }
    finally { process.exitCode = 1; }
  }
}

startServer();
