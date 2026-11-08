import "dotenv/config";
import mongoose from "mongoose";
import { setTimeout as delay } from "node:timers/promises";
import connectDatabase from "../src/config/database.js";
import { validateEnvironment } from "../src/config/environment.js";
import NotificationOutbox from "../src/models/NotificationOutbox.js";
import { validateBookingEmailConfiguration } from "../src/services/bookingEmailService.js";
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
    const once = process.argv.includes("--once");
    do {
      if (stopping) break;
      try {
        const result = await dispatchBookingEmailBatch({ shouldStop: () => stopping });
        if (result.claimed) console.log("Booking email dispatch batch finished.", result);
      } catch (error) {
        console.error("Booking email worker operation failed.", {
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
    console.error("Booking email worker startup failed.", {
      category: sanitizeBookingEmailFailure(error),
    });
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    clearTimeout(shutdownTimer);
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

await run();
