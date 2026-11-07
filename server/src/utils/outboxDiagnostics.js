import mongoose from "mongoose";
import { BOOKING_EMAIL_POLICY } from "../services/bookingEmailDispatcher.js";
import { safeDocumentId, safeDiagnosticDate } from "./safeDiagnosticValues.js";

const statuses = ["pending", "processing", "sent", "failed"];
const events = ["booking_requested", "booking_accepted", "booking_rejected", "booking_cancelled", "booking_completed"];

export async function inspectOutbox(db = mongoose.connection.db, { now = new Date() } = {}) {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid diagnostic clock.");
  const ready = {
    status: { $in: ["pending", "failed"] }, attempts: { $lt: BOOKING_EMAIL_POLICY.maxAttempts },
    nextAttemptAt: { $type: "date", $lte: date },
  };
  const expired = { status: "processing", leaseExpiresAt: { $type: "date", $lte: date } };
  const terminal = { status: "failed", nextAttemptAt: null };
  const sample = (filter) => [
    { $match: filter }, { $sort: { createdAt: 1, _id: 1 } }, { $limit: 20 },
    { $project: { _id: 1, bookingId: 1, eventType: 1, status: 1, attempts: 1, createdAt: 1, nextAttemptAt: 1, leaseExpiresAt: 1 } },
  ];
  const count = (filter) => [{ $match: filter }, { $count: "value" }];
  const [result] = await db.collection("notificationoutboxes").aggregate([{
    $facet: {
      statuses: [{ $group: {
        _id: { $cond: [{ $in: ["$status", statuses] }, "$status", "unknown"] }, value: { $sum: 1 },
      } }],
      ready: count(ready), expiredLeases: count(expired), terminalFailures: count(terminal),
      oldestReady: [{ $match: { ...ready, createdAt: { $type: "date" } } }, { $group: { _id: null, at: { $min: "$createdAt" } } }],
      readySamples: sample(ready), expiredSamples: sample(expired), terminalSamples: sample(terminal),
    },
  }], { maxTimeMS: 30000 }).toArray();
  const counts = Object.fromEntries([...statuses, "unknown"].map((status) => [status, 0]));
  for (const entry of result.statuses) counts[entry._id] = entry.value;
  for (const name of ["ready", "expiredLeases", "terminalFailures"]) counts[name] = result[name][0]?.value || 0;
  const summarize = (rows) => rows.map((row) => ({
    jobId: safeDocumentId(row._id), bookingId: safeDocumentId(row.bookingId),
    eventType: events.includes(row.eventType) ? row.eventType : "unknown",
    status: statuses.includes(row.status) ? row.status : "unknown",
    attempts: Number.isSafeInteger(row.attempts) && row.attempts >= 0 ? row.attempts : null,
    createdAt: safeDiagnosticDate(row.createdAt), nextAttemptAt: safeDiagnosticDate(row.nextAttemptAt),
    leaseExpiresAt: safeDiagnosticDate(row.leaseExpiresAt),
  }));
  const oldest = safeDiagnosticDate(result.oldestReady[0]?.at);
  return {
    readOnly: true, generatedAt: date.toISOString(), counts,
    oldestReadyAgeMs: oldest ? Math.max(0, date.getTime() - new Date(oldest).getTime()) : null,
    samples: { ready: summarize(result.readySamples), expiredLeases: summarize(result.expiredSamples), terminalFailures: summarize(result.terminalSamples) },
  };
}
