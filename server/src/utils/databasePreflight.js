import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import User from "../models/User.js";
import Vendor from "../models/Vendor.js";
import Availability from "../models/Availability.js";
import RefreshToken from "../models/RefreshToken.js";
import EmailOtp from "../models/EmailOtp.js";
import NotificationOutbox from "../models/NotificationOutbox.js";
import VendorModerationAudit from "../models/VendorModerationAudit.js";
import { inspectDatabaseTopology } from "../config/database.js";
import { auditBookingDates } from "./bookingDataAudit.js";
import { safeDocumentId } from "./safeDiagnosticValues.js";

const models = [Booking, User, Vendor, Availability, RefreshToken, EmailOtp, NotificationOutbox, VendorModerationAudit];
const MAX_TIME_MS = 30000;
const failure = (code) => Object.assign(new Error("Read-only database preflight failed."), { code });
const canonical = (value, key) => {
  if (Array.isArray(value)) {
    const values = value.map((entry) => canonical(entry));
    return ["$in", "$nin"].includes(key) ? values.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : values;
  }
  if (value && typeof value === "object")
    return Object.fromEntries(Object.keys(value).sort().map((name) => [name, canonical(value[name], name)]));
  return value;
};

function matchingIndex(actual, key, options) {
  return JSON.stringify(Object.entries(actual.key)) === JSON.stringify(Object.entries(key)) &&
    Boolean(actual.unique) === Boolean(options.unique) &&
    Boolean(actual.sparse) === Boolean(options.sparse) && !actual.hidden &&
    JSON.stringify(canonical(actual.partialFilterExpression || null)) === JSON.stringify(canonical(options.partialFilterExpression || null)) &&
    (actual.expireAfterSeconds ?? null) === (options.expireAfterSeconds ?? null) &&
    (!actual.collation || actual.collation.locale === "simple");
}

export async function inspectRequiredIndexes(db = mongoose.connection.db, { collections } = {}) {
  const checks = [];
  for (const model of models) {
    const collection = model.collection.name;
    if (collections && !collections.includes(collection)) continue;
    let indexes;
    try {
      indexes = await db.collection(collection).listIndexes({ maxTimeMS: MAX_TIME_MS }).toArray();
    } catch (error) {
      if (error.code === 26) indexes = [];
      else throw failure("PREFLIGHT_READ_FAILED");
    }
    for (const [key, options] of model.schema.indexes()) {
      const name = options.name || Object.entries(key).map(([field, order]) => `${field}_${order}`).join("_");
      const sameName = indexes.find((index) => index.name === name);
      const sameKey = indexes.some((index) => JSON.stringify(Object.entries(index.key)) === JSON.stringify(Object.entries(key)));
      checks.push({ collection, index: name, status: sameName && matchingIndex(sameName, key, options)
        ? "PASS" : sameName || sameKey ? "INCOMPATIBLE" : "MISSING" });
    }
  }
  return checks;
}

export async function assertRequiredIndexes(db = mongoose.connection.db, options) {
  const checks = await inspectRequiredIndexes(db, options);
  if (checks.some((check) => check.status !== "PASS")) throw failure("PREFLIGHT_INDEX_INVALID");
  return checks;
}

const typed = (field, type) => ({ $eq: [{ $type: `$${field}` }, type] });
const nonemptyString = (field) => ({ $cond: [
  typed(field, "string"), { $gt: [{ $strLenCP: { $trim: { input: `$${field}` } } }, 0] }, false,
] });
const requiredExpression = (path) => {
  if (path.instance === "String") return nonemptyString(path.path);
  if (path.instance === "ObjectId") return typed(path.path, "objectId");
  if (path.instance === "Date") return typed(path.path, "date");
  if (path.instance === "Number") return { $and: [
    { $in: [{ $type: `$${path.path}` }, ["double", "int", "long", "decimal"]] },
    { $gte: [`$${path.path}`, path.options.min ?? -Number.MAX_VALUE] },
    { $lte: [`$${path.path}`, Number.MAX_VALUE] },
  ] };
  if (path.instance === "Embedded") return typed(path.path, "object");
  return { $ne: [{ $ifNull: [`$${path.path}`, null] }, null] };
};

async function issues(collection, expression) {
  const [result] = await collection.aggregate([
    { $match: { $expr: { $not: [expression] } } },
    { $facet: { count: [{ $count: "value" }], samples: [{ $limit: 20 }, { $project: { _id: 1 } }] } },
  ], { maxTimeMS: MAX_TIME_MS }).toArray();
  return { count: result.count[0]?.value || 0, sampleIds: result.samples.map((row) => safeDocumentId(row._id)).filter(Boolean) };
}

export async function inspectDatabaseData(db = mongoose.connection.db) {
  const collections = [];
  for (const model of models) {
    const expressions = [typed("_id", "objectId")];
    model.schema.eachPath((name, path) => {
      if (path.options.required) expressions.push(requiredExpression(path));
    });
    const requiredFields = await issues(db.collection(model.collection.name), { $and: expressions });
    collections.push({ collection: model.collection.name, requiredFields });
  }
  const statuses = [];
  for (const [collection, field, allowed] of [
    ["bookings", "status", ["pending", "accepted", "rejected", "cancelled", "completed"]],
    ["vendors", "verificationStatus", ["pending", "approved", "rejected", null, ""]],
    ["users", "accountStatus", ["active", "deactivated", "blocked", "suspended", null]],
    ["users", "role", ["customer", "vendor", "admin", null]],
    ["notificationoutboxes", "status", ["pending", "processing", "sent", "failed"]],
    ["notificationoutboxes", "eventType", ["booking_requested", "booking_accepted", "booking_rejected", "booking_cancelled", "booking_completed"]],
    ["notificationoutboxes", "payload.recipientRole", ["customer", "vendor"]],
  ]) statuses.push({ collection, field, ...await issues(db.collection(collection), { $in: [{ $ifNull: [`$${field}`, null] }, allowed] }) });
  const dates = await auditBookingDates(db.collection("bookings"));
  const legacyVendorApprovals = await db.collection("vendors").countDocuments({ verificationStatus: { $exists: false } }, { maxTimeMS: MAX_TIME_MS });
  return { collections, statuses, dates, legacyVendorApprovals };
}

export async function runDatabasePreflight(db = mongoose.connection.db) {
  try {
    const topology = await inspectDatabaseTopology(db);
    // Do not run MongoDB 6-era audit operators against an unsupported server.
    if (!topology.mongodb6OrNewer)
      return { readOnly: true, status: "BLOCKED", topology, indexes: [], data: null };
    const indexes = await inspectRequiredIndexes(db);
    const data = await inspectDatabaseData(db);
    const blocked = !topology.transactionsSupported || !topology.mongodb6OrNewer ||
      indexes.some((check) => check.status !== "PASS") ||
      data.collections.some((check) => check.requiredFields.count) || data.statuses.some((check) => check.count) ||
      data.dates.bookingsMissingDateKeys || data.dates.bookingsInvalidDates || data.dates.bookingsInvalidDateKeys ||
      data.dates.bookingsMismatchedDateKeys || data.dates.duplicateReservationGroups;
    return { readOnly: true, status: blocked ? "BLOCKED" : "PASS", topology, indexes, data };
  } catch {
    throw failure("PREFLIGHT_READ_FAILED");
  }
}
