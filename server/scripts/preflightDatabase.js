import "dotenv/config";
import mongoose from "mongoose";
import { databaseConnectionOptions } from "../src/config/database.js";
import { runDatabasePreflight } from "../src/utils/databasePreflight.js";

let connection;
try {
  if (!process.env.MONGODB_URI) throw new Error("Database configuration is missing.");
  connection = mongoose.createConnection(process.env.MONGODB_URI, {
    ...databaseConnectionOptions(), readPreference: "primary",
  });
  await connection.asPromise();
  const report = await runDatabasePreflight(connection.db);
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "PASS") process.exitCode = 1;
} catch {
  console.error(JSON.stringify({ readOnly: true, status: "BLOCKED", category: "database_preflight_failed" }));
  process.exitCode = 1;
} finally {
  if (connection) await connection.close().catch(() => {});
}
