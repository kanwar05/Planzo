import "dotenv/config";
import mongoose from "mongoose";
import { setTimeout as delay } from "node:timers/promises";
import connectDatabase from "../src/config/database.js";
import { validateEnvironment } from "../src/config/environment.js";
import NotificationOutbox from "../src/models/NotificationOutbox.js";
import { validateBookingEmailConfiguration } from "../src/services/bookingEmailService.js";
import { assertRequiredIndexes } from "../src/utils/databasePreflight.js";
import { logEvent } from "../src/utils/logger.js";
import {
  dispatchBookingEmailBatch,
  sanitizeBookingEmailFailure,
} from "../src/services/bookingEmailDispatcher.js";

let stopping = false;
let shutdownTimer;
const polling = new AbortController();
function stop() {
  if (stopping) return;
  stopping = true;
  logEvent("info", "email_worker_stopping");
  polling.abort();
  // Give the bounded SMTP attempt and its DB acknowledgement time to finish.
  // If forced to exit, the durable lease makes the claim recoverable.
  shutdownTimer = setTimeout(() => process.exit(1), 55_000);
  shutdownTimer.unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

async function run() {
  try {
    if (process.env.NODE_ENV === "test")
      throw new Error("The email worker CLI is disabled during tests.");
    if (process.argv.slice(2).some((argument) => argument !== "--once"))
      throw new Error("Usage: node scripts/dispatchBookingEmails.js [--once]");
    try {
      validateEnvironment();
      validateBookingEmailConfiguration();
    } catch {
      const error = new Error("Booking email worker configuration is invalid.");
      error.code = "EMAIL_CONFIG";
      throw error;
    }
    await connectDatabase();
    await NotificationOutbox.createIndexes();
    await assertRequiredIndexes(mongoose.connection.db, { collections: [NotificationOutbox.collection.name] });
    const once = process.argv.includes("--once");
    logEvent("info", "email_worker_started", { phase: once ? "once" : "persistent" });
    do {
      if (stopping) break;
      try {
        const result = await dispatchBookingEmailBatch({
          shouldStop: () => stopping,
          logger: { warn: (_message, { category } = {}) => logEvent("warn", "email_delivery_failed", { category }) },
        });
        if (result.claimed) logEvent("info", "email_worker_batch", result);
      } catch (error) {
        logEvent("error", "email_worker_operation_failed", {
          category: sanitizeBookingEmailFailure(error),
        });
        if (once) process.exitCode = 1;
      }
      if (once || stopping) break;
      await delay(5000, undefined, { signal: polling.signal }).catch((error) => {
        if (error.name !== "AbortError") throw error;
      });
    } while (!stopping);
  } catch (error) {
    logEvent("error", "email_worker_startup_failed", {
      category: sanitizeBookingEmailFailure(error),
    });
    process.exitCode = 1;
  } finally {
    try { await mongoose.disconnect(); }
    catch {
      logEvent("error", "email_worker_cleanup_failed");
      process.exitCode = 1;
    }
    logEvent("info", "email_worker_stopped");
    clearTimeout(shutdownTimer);
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

await run();
