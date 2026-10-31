import mongoose from "mongoose";

export default async function connectDatabase() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing. Add it to server/.env.");
  }

  // Index creation is explicit, after the read-only booking-data preflight.
  const connection = await mongoose.connect(mongoUri, { autoIndex: false });
  const topology = await connection.connection.db.admin().command({ hello: 1 });
  if (!topology.setName && topology.msg !== "isdbgrid") {
    throw new Error(
      "Booking reliability requires a MongoDB replica set (or mongos) for transactions. See docs/MVP_MIGRATION.md.",
    );
  }
  if (topology.maxWireVersion < 17) {
    throw new Error("Booking indexes require MongoDB 6 or newer.");
  }
  console.log(`MongoDB connected: ${connection.connection.host}`);
  return connection;
}
