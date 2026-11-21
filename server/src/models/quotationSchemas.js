import mongoose from "mongoose";
import { cancellationPolicySnapshotSchema } from "./cancellationPolicySchemas.js";

export const MAX_COMMERCIAL_AMOUNT = 100_000_000_000;
export const MAX_QUOTATION_REVISIONS = 100;
const integer = (min, max) => ({ type: Number, min, max, validate: Number.isSafeInteger });
const lineSchema = new mongoose.Schema({
  description: { type: String, required: true, maxlength: 300 },
  quantity: { ...integer(1, 1_000_000), required: true },
  unitPriceAmount: { ...integer(0, MAX_COMMERCIAL_AMOUNT), required: true },
}, { _id: false });
const chargeSchema = new mongoose.Schema({
  description: { type: String, required: true, maxlength: 300 },
  amount: { ...integer(0, MAX_COMMERCIAL_AMOUNT), required: true },
}, { _id: false });

// Shared typed value object for append-only revisions and accepted agreements.
// Amounts are integer INR paise; accepted copies never depend on live packages.
export const quotationContentDefinition = {
  cancellationPolicy: { type: cancellationPolicySnapshotSchema, default: undefined },
  selectedPackageId: { type: mongoose.Schema.Types.ObjectId, default: undefined },
  selectedPackageTitle: { type: String, maxlength: 120, default: undefined },
  serviceDescription: { type: String, required: true, maxlength: 2000 },
  items: { type: [lineSchema], required: true, validate: value => value.length >= 1 && value.length <= 50 },
  additionalCharges: { type: [chargeSchema], default: [], validate: value => value.length <= 20 },
  discountAmount: { ...integer(0, MAX_COMMERCIAL_AMOUNT), default: 0 },
  subtotalAmount: { ...integer(0, MAX_COMMERCIAL_AMOUNT), required: true },
  totalAmount: { ...integer(0, MAX_COMMERCIAL_AMOUNT), required: true },
  currency: { type: String, enum: ["INR"], default: "INR", required: true },
  serviceDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  deliverables: { type: [{ type: String, maxlength: 300 }], default: [], validate: value => value.length <= 30 },
  exclusions: { type: [{ type: String, maxlength: 300 }], default: [], validate: value => value.length <= 30 },
  terms: { type: String, maxlength: 4000, default: "" },
  expiresAt: { type: Date, required: true },
};
export const quotationContentSchema = new mongoose.Schema(quotationContentDefinition, { _id: false });
export const agreementSchema = new mongoose.Schema({
  ...quotationContentDefinition,
  quotationId: { type: mongoose.Schema.Types.ObjectId, required: true },
  revision: { ...integer(1, Number.MAX_SAFE_INTEGER), required: true },
  acceptedAt: { type: Date, required: true },
  cancellationPolicyAcknowledgedAt: { type: Date, default: undefined },
}, { _id: false });
