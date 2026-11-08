import "dotenv/config";
import mongoose from "mongoose";
import { databaseConnectionOptions } from "../src/config/database.js";
import { inspectOutbox } from "../src/utils/outboxDiagnostics.js";

let connection;
try {
  if (!process.env.MONGODB_URI) throw new Error("Database configuration is missing.");
  connection = mongoose.createConnection(process.env.MONGODB_URI, {
    ...databaseConnectionOptions(), readPreference: "primary",
  });
  await connection.asPromise();
  console.log(JSON.stringify(await inspectOutbox(connection.db), null, 2));
} catch {
  console.error(JSON.stringify({ readOnly: true, status: "BLOCKED", category: "outbox_diagnostics_failed" }));
  process.exitCode = 1;
} finally {
  if (connection) await connection.close().catch(() => {});
}
