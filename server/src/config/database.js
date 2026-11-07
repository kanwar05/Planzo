import mongoose from "mongoose";
import { logEvent } from "../utils/logger.js";
import { assertStagingDatabase } from "./stagingSafety.js";

export function databaseConnectionOptions(env = process.env) {
  assertStagingDatabase(env);
  const timeout = (name, fallback) => {
    const value = env[name] === undefined ? fallback : Number(env[name]);
    if (!Number.isSafeInteger(value) || value < 1000 || value > 120000) {
      const error = new Error("Database timeout configuration is invalid.");
      error.code = "DB_CONFIGURATION_INVALID";
      throw error;
    }
    return value;
  };
  return {
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: timeout("MONGO_SERVER_SELECTION_TIMEOUT_MS", 10000),
    connectTimeoutMS: timeout("MONGO_CONNECT_TIMEOUT_MS", 10000),
    socketTimeoutMS: timeout("MONGO_SOCKET_TIMEOUT_MS", 20000),
    waitQueueTimeoutMS: timeout("MONGO_WAIT_QUEUE_TIMEOUT_MS", 5000),
    retryReads: true,
    retryWrites: true,
  };
}

export async function inspectDatabaseTopology(db) {
  const hello = await db.admin().command({ hello: 1 }, { maxTimeMS: 10000 });
  return {
    topology: hello.msg === "isdbgrid" ? "mongos" : hello.setName ? "replicaSet" : "standalone",
    transactionsSupported: Boolean(hello.setName || hello.msg === "isdbgrid"),
    mongodb6OrNewer: Number.isInteger(hello.maxWireVersion) && hello.maxWireVersion >= 17,
  };
}

export default async function connectDatabase() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing. Add it to server/.env.");
  }

  // Index creation is explicit, after the read-only booking-data preflight.
  let connection;
  let topology;
  try {
    connection = await mongoose.connect(mongoUri, databaseConnectionOptions());
    topology = await inspectDatabaseTopology(connection.connection.db);
  } catch {
    const error = new Error("Database connection failed.");
    error.code = "DB_UNAVAILABLE";
    throw error;
  }
  if (!topology.transactionsSupported) {
    const error = new Error(
      "Booking reliability requires a MongoDB replica set (or mongos) for transactions. See docs/MVP_MIGRATION.md.",
    );
    error.code = "DB_TOPOLOGY_UNSUPPORTED";
    throw error;
  }
  if (!topology.mongodb6OrNewer) {
    const error = new Error("Booking indexes require MongoDB 6 or newer.");
    error.code = "DB_VERSION_UNSUPPORTED";
    throw error;
  }
  logEvent("info", "database_connected");
  return connection;
}
