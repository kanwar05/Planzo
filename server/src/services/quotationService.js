import { createHash, randomUUID } from "node:crypto";
import Booking from "../models/Booking.js";
import Vendor from "../models/Vendor.js";
import Quotation from "../models/Quotation.js";
import { MAX_COMMERCIAL_AMOUNT, MAX_QUOTATION_REVISIONS } from "../models/quotationSchemas.js";
import ApiError from "../utils/ApiError.js";
import { normalizeDateOnly, storedBookingDay, utcToday } from "../utils/bookingDates.js";
import { assertVerifiedEmail } from "../utils/emailVerification.js";
import { assertVendorAvailable } from "../utils/availability.js";
import { lockAccountForBooking, lockVendorForBooking, withBookingTransaction } from "../utils/vendorBookingTransaction.js";
import { hasActiveVendorOwner } from "./vendorSearchService.js";
import { enqueueBookingEmails } from "./bookingNotificationService.js";
import { quotationContentView, quotationView } from "./quotationViewService.js";
import { currentCancellationPolicy } from "./cancellationPolicyService.js";
import { cancellationPolicyView, legacyCancellationPolicy } from "./cancellationPolicyViewService.js";

const same = (left, right) => String(left?._id || left || "") === String(right?._id || right || "");
const hash = value => createHash("sha256").update(value).digest("hex");
const invalid = message => new ApiError(400, message);
const conflict = () => new ApiError(409, "The quotation or booking changed. Refresh before trying again.");
const cleanText = (value, name, maximum, optional = false) => {
  if (value === undefined && optional) return "";
  if (typeof value !== "string" || value.trim().length > maximum || (!optional && !value.trim()))
    throw invalid(`${name} must be ${optional ? "text" : "non-empty text"} up to ${maximum} characters.`);
  const cleaned = value.trim().replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "").trim();
  if (!optional && !cleaned) throw invalid(`${name} must contain text.`);
  return cleaned;
};
const money = (value, name, fallback) => {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_COMMERCIAL_AMOUNT)
    throw invalid(`${name} must be an integer INR paise amount between 0 and ${MAX_COMMERCIAL_AMOUNT}.`);
  return value;
};
const strings = (value, name) => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 30) throw invalid(`${name} must contain at most 30 entries.`);
  return value.map(item => cleanText(item, name, 300));
};

export function normalizeQuotation(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid("Quotation body must be an object.");
  if (body.cancellationPolicy !== undefined || body.cancellationPolicyAcknowledgedAt !== undefined)
    throw invalid("Cancellation policies are selected by the marketplace, not quotation input.");
  if (body.currency !== undefined && body.currency !== "INR") throw invalid("Quotations use INR only.");
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50)
    throw invalid("A quotation must contain between 1 and 50 itemized services.");
  const items = body.items.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw invalid("Each quotation item must be an object.");
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 1_000_000)
      throw invalid("Item quantity must be an integer between 1 and 1000000.");
    return { description: cleanText(item.description, "Item description", 300),
      quantity: item.quantity, unitPriceAmount: money(item.unitPriceAmount, "Item price") };
  });
  const chargeInput = body.additionalCharges === undefined ? [] : body.additionalCharges;
  if (!Array.isArray(chargeInput) || chargeInput.length > 20) throw invalid("Provide at most 20 additional charges.");
  const additionalCharges = chargeInput.map(charge => {
    if (!charge || typeof charge !== "object" || Array.isArray(charge)) throw invalid("Each additional charge must be an object.");
    return { description: cleanText(charge.description, "Charge description", 300), amount: money(charge.amount, "Additional charge") };
  });
  const subtotalAmount = items.reduce((total, item) => total + item.quantity * item.unitPriceAmount, 0);
  const gross = additionalCharges.reduce((total, charge) => total + charge.amount, subtotalAmount);
  if (!Number.isSafeInteger(subtotalAmount) || !Number.isSafeInteger(gross) || gross > MAX_COMMERCIAL_AMOUNT)
    throw invalid("Quotation total exceeds the supported amount.");
  const discountAmount = money(body.discountAmount, "Discount", 0);
  if (discountAmount > gross) throw invalid("Discount cannot exceed the quotation's charges.");
  const serviceDate = normalizeDateOnly(body.serviceDate, "service date");
  if (typeof body.expiresAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(body.expiresAt))
    throw invalid("Quotation expiry must be an explicit UTC ISO timestamp.");
  normalizeDateOnly(body.expiresAt.slice(0, 10), "expiry date");
  const expiresAt = new Date(body.expiresAt);
  if (!Number.isFinite(expiresAt.getTime())) throw invalid("Provide a valid quotation expiry.");
  return {
    serviceDescription: cleanText(body.serviceDescription, "Service description", 2000), items, additionalCharges,
    discountAmount, subtotalAmount, totalAmount: gross - discountAmount, currency: "INR", serviceDate,
    deliverables: strings(body.deliverables, "Deliverables"), exclusions: strings(body.exclusions, "Exclusions"),
    terms: cleanText(body.terms, "Terms", 4000, true), expiresAt,
  };
}

export function validateQuotationId(value, name = "booking id") {
  if (typeof value !== "string" || !/^[a-f0-9]{24}$/i.test(value)) throw invalid(`Invalid ${name}.`);
}
export function quotationRevision(value, allowZero = false) {
  const parsed = typeof value === "string" && /^[1-9]\d*$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || parsed < (allowZero ? 0 : 1) || parsed >= Number.MAX_SAFE_INTEGER)
    throw invalid("Provide a valid quotation revision.");
  return parsed;
}
function keyHash(key) {
  if (typeof key !== "string" || !/^[A-Za-z0-9._:-]{16,128}$/.test(key))
    throw invalid("Quotation submission requires an Idempotency-Key of 16 to 128 safe ASCII characters.");
  return hash(key);
}
const revisionFilter = revision => revision === 0
  ? { $or: [{ quotationRevision: 0 }, { quotationRevision: { $exists: false } }] }
  : { quotationRevision: revision };

async function bookingAccess(bookingId, actor, session) {
  const booking = await Booking.findById(bookingId).session(session || null);
  if (!booking) throw new ApiError(404, "Booking not found.");
  const vendor = await Vendor.findById(booking.vendorId).session(session || null);
  const customer = actor.role === "customer" && same(booking.customerId, actor);
  const owner = actor.role === "vendor" && same(vendor?.userId, actor);
  if (!customer && !owner && actor.role !== "admin") throw new ApiError(403, "You cannot view this booking's quotations.");
  return { booking, vendor, customer, owner };
}
async function lockActor(actor, session) {
  const current = await lockAccountForBooking(actor._id, session);
  if ((current.authVersion || 0) !== (actor.authVersion || 0)) throw new ApiError(401, "Your account changed. Please log in again.");
  assertVerifiedEmail(current);
}
async function replay(bookingId, requestKeyHash, requestHash, session) {
  const previous = await Quotation.findOne({ bookingId, requestKeyHash }).select("+requestHash").session(session || null);
  if (previous && previous.requestHash !== requestHash)
    throw new ApiError(409, "This Idempotency-Key was already used for another quotation submission.");
  return previous;
}

export async function quotationHistory(bookingId, actor) {
  validateQuotationId(bookingId);
  await bookingAccess(bookingId, actor);
  const rows = await Quotation.find({ bookingId }).sort({ revision: -1 }).limit(MAX_QUOTATION_REVISIONS);
  return rows.map(quotationView);
}

export async function offerQuotation(bookingId, actor, body, key) {
  validateQuotationId(bookingId);
  if (actor.role !== "vendor") throw new ApiError(403, "Only the vendor may offer a quotation.");
  const expectedRevision = quotationRevision(body?.expectedRevision, true);
  const content = normalizeQuotation(body);
  const requestKeyHash = keyHash(key);
  const requestHash = hash(JSON.stringify({ expectedRevision, ...content }));
  const initial = await bookingAccess(bookingId, actor);
  if (!initial.owner) throw new ApiError(403, "Only the owning vendor may offer a quotation.");
  let result;
  try {
    result = await withBookingTransaction(async session => {
      await lockActor(actor, session);
      await lockVendorForBooking(initial.booking.vendorId, session, actor._id);
      const { booking } = await bookingAccess(bookingId, actor, session);
      const previous = await replay(bookingId, requestKeyHash, requestHash, session);
      if (previous) return { quotation: previous, booking, replayed: true };
      if (expectedRevision >= MAX_QUOTATION_REVISIONS)
        throw new ApiError(409, `A booking supports at most ${MAX_QUOTATION_REVISIONS} quotation revisions.`);
      if (booking.status !== "pending" || booking.acceptedAgreement || (booking.quotationRevision || 0) !== expectedRevision)
        throw conflict();
      const day = storedBookingDay(booking);
      if (content.serviceDate !== day) throw invalid("The quotation service date must match the booking's UTC event date.");
      if (day < utcToday()) throw new ApiError(409, "Past booking requests cannot receive a new quotation.");
      if (content.expiresAt <= new Date() || content.expiresAt.getTime() > Date.now() + 365 * 86400000)
        throw invalid("Quotation expiry must be in the future and within 365 days.");
      const selected = booking.selectedPackage;
      const [quotation] = await Quotation.create([{
        bookingId: booking._id, vendorId: booking.vendorId, customerId: booking.customerId, createdById: actor._id,
        revision: expectedRevision + 1, requestKeyHash, requestHash, ...content,
        cancellationPolicy: await currentCancellationPolicy(session),
        ...(selected?.packageId ? { selectedPackageId: selected.packageId, selectedPackageTitle: selected.title } : {}),
      }], { session });
      const updated = await Booking.findOneAndUpdate({
        _id: booking._id, status: "pending", acceptedAgreement: null, ...revisionFilter(expectedRevision),
      }, { $set: { quotationRevision: quotation.revision, quotationStatus: "offered" } }, { new: true, session, runValidators: true });
      if (!updated) throw conflict();
      return { quotation, booking: updated, replayed: false };
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const previous = await replay(bookingId, requestKeyHash, requestHash);
    if (!previous) throw conflict();
    result = { quotation: previous, booking: (await bookingAccess(bookingId, actor)).booking, replayed: true };
  }
  return result;
}

export async function decideQuotation(bookingId, revisionInput, actor, decision, body = {}) {
  validateQuotationId(bookingId);
  const revision = quotationRevision(revisionInput);
  if (actor.role !== "customer") throw new ApiError(403, "Only the booking customer may decide a quotation.");
  if (!["accept", "reject"].includes(decision)) throw invalid("Invalid quotation decision.");
  const initial = await bookingAccess(bookingId, actor);
  if (!initial.customer) throw new ApiError(403, "Only the booking customer may decide a quotation.");
  const eventId = randomUUID();
  try {
    return await withBookingTransaction(async session => {
      await lockActor(actor, session);
      const vendor = await lockVendorForBooking(initial.booking.vendorId, session);
      const { booking } = await bookingAccess(bookingId, actor, session);
      if (decision === "accept" && booking.acceptedAgreement?.revision === revision)
        return booking; // Pure replay retains the agreement even after cancellation/completion.
      if (booking.status !== "pending" || booking.acceptedAgreement || (booking.quotationRevision || 0) !== revision)
        throw conflict();
      if (decision === "reject" && booking.quotationStatus === "rejected") return booking;
      if (booking.quotationStatus !== "offered") throw conflict();
      const quotation = await Quotation.findOne({ bookingId, revision }).session(session);
      if (!quotation) throw new ApiError(404, "Quotation not found.");
      const filter = { _id: booking._id, status: "pending", quotationRevision: revision,
        quotationStatus: "offered", acceptedAgreement: null };
      let changes;
      if (decision === "accept") {
        if (quotation.expiresAt <= new Date()) throw new ApiError(409, "This quotation has expired. Request a revised quotation.");
        const day = storedBookingDay(booking);
        if (day !== quotation.serviceDate || day < utcToday()) throw new ApiError(409, "The booking date is no longer eligible for acceptance.");
        if (!(await hasActiveVendorOwner(vendor, session))) throw new ApiError(409, "Vendor must be approved and active to accept a quotation.");
        await assertVendorAvailable({ vendorId: vendor._id, dateOnly: day, excludeBookingId: booking._id, session });
        const policy = quotation.cancellationPolicy ? cancellationPolicyView(quotation.cancellationPolicy) : legacyCancellationPolicy();
        if (!policy) throw new ApiError(409, "The quotation's cancellation policy needs operator review.");
        const acknowledgment = body?.cancellationPolicyAcknowledgment;
        if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => key !== "cancellationPolicyAcknowledgment") ||
            !acknowledgment || typeof acknowledgment !== "object" || Array.isArray(acknowledgment) ||
            Object.keys(acknowledgment).some(key => !["key", "version"].includes(key)) ||
            acknowledgment.key !== policy.key || !Number.isSafeInteger(acknowledgment.version) || acknowledgment.version !== policy.version)
          throw invalid("Explicitly acknowledge this quotation's cancellation policy key and version before accepting.");
        // Evaluate expiry with the database clock at the conditional write too.
        filter.$expr = { $gt: [{ $literal: quotation.expiresAt }, "$$NOW"] };
        changes = { status: "accepted", quotationStatus: "accepted", acceptedAgreement: {
          ...quotationContentView(quotation), quotationId: quotation._id, revision, acceptedAt: new Date(),
          cancellationPolicy: policy, cancellationPolicyAcknowledgedAt: new Date(),
        } };
      } else changes = { quotationStatus: "rejected" };
      const updated = await Booking.findOneAndUpdate(filter, { $set: changes }, { new: true, session, runValidators: true });
      if (!updated) throw conflict();
      if (decision === "accept") await enqueueBookingEmails({ booking: updated, eventType: "booking_accepted", eventId, session });
      return updated;
    });
  } catch (error) {
    if (error.code === 11000 && (error.keyPattern?.eventDateOnly || error.message?.includes("one_confirmed_booking_per_vendor_date")))
      throw new ApiError(409, "Vendor already has a booking on this date.");
    throw error;
  }
}
