import mongoose from "mongoose";
import { logEvent } from "../utils/logger.js";

export function createReadinessHandler({ connection = mongoose.connection, timeoutMs = 1500, logger = logEvent } = {}) {
  let inFlight;
  let previous;
  async function databaseReady() {
    if (connection.readyState !== 1 || !connection.db) return false;
    if (!inFlight) {
      // Share probes until the actual operation settles, including after an
      // HTTP deadline. Per-stage driver timeouts bound the underlying operation.
      // Avoid CSOT timeoutMS: it is unsafe in the currently installed driver.
      inFlight = Promise.resolve().then(() => connection.db.admin().command(
        { ping: 1 }, { maxTimeMS: Math.min(timeoutMs, 1000), readPreference: "primary" },
      )).then(() => true, () => false).finally(() => { inFlight = undefined; });
    }
    let timer;
    try {
      return await Promise.race([
        inFlight,
        new Promise((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); }),
      ]);
    } finally { clearTimeout(timer); }
  }
  return async (req, res) => {
    const ready = !req.app.locals.shuttingDown && await databaseReady();
    if (previous !== ready) {
      logger(ready ? "info" : "warn", "database_readiness_changed", { ready });
      previous = ready;
    }
    res.set("Cache-Control", "no-store");
    res.status(ready ? 200 : 503).json({ success: ready, message: ready ? "Planzo API is ready." : "Planzo API is not ready." });
  };
}
