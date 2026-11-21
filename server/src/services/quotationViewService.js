import { cancellationPolicyView, legacyCancellationPolicy } from "./cancellationPolicyViewService.js";

const identifier = value => {
  const id = typeof value === "string" ? value : value?._bsontype === "ObjectId" && typeof value.toHexString === "function" ? value.toHexString() : "";
  return /^[a-f0-9]{24}$/i.test(id) ? id : undefined;
};
const amount = value => Number.isSafeInteger(value) && value >= 0;
const date = value => value instanceof Date && Number.isFinite(value.getTime());

export function quotationContentView(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const source = typeof input.toObject === "function" ? input.toObject() : input;
  const result = {};
  for (const key of ["serviceDescription", "selectedPackageTitle", "serviceDate", "terms"])
    if (typeof source[key] === "string") result[key] = source[key];
  if (identifier(source.selectedPackageId)) result.selectedPackageId = identifier(source.selectedPackageId);
  for (const key of ["discountAmount", "subtotalAmount", "totalAmount"])
    if (amount(source[key])) result[key] = source[key];
  if (source.currency === "INR") result.currency = "INR";
  result.items = (Array.isArray(source.items) ? source.items : []).slice(0, 50)
    .filter(item => typeof item?.description === "string" && Number.isSafeInteger(item.quantity) && item.quantity > 0 && amount(item.unitPriceAmount))
    .map(item => ({ description: item.description, quantity: item.quantity, unitPriceAmount: item.unitPriceAmount }));
  result.additionalCharges = (Array.isArray(source.additionalCharges) ? source.additionalCharges : []).slice(0, 20)
    .filter(item => typeof item?.description === "string" && amount(item.amount))
    .map(item => ({ description: item.description, amount: item.amount }));
  for (const key of ["deliverables", "exclusions"])
    result[key] = (Array.isArray(source[key]) ? source[key] : []).filter(item => typeof item === "string").slice(0, 30);
  if (date(source.expiresAt)) result.expiresAt = source.expiresAt;
  if (source.cancellationPolicy) result.cancellationPolicy = cancellationPolicyView(source.cancellationPolicy);
  return result;
}

export function quotationView(input) {
  const result = quotationContentView(input);
  if (!result) return null;
  const source = typeof input.toObject === "function" ? input.toObject() : input;
  for (const key of ["_id", "bookingId"])
    if (identifier(source[key])) result[key] = identifier(source[key]);
  if (Number.isSafeInteger(source.revision) && source.revision > 0) result.revision = source.revision;
  if (date(source.createdAt)) result.createdAt = source.createdAt;
  // An unaccepted legacy revision is presented with its grandfathered terms,
  // without rewriting the append-only source quotation.
  if (!source.cancellationPolicy) result.cancellationPolicy = legacyCancellationPolicy();
  return result;
}

export function acceptedAgreementView(input) {
  const result = quotationContentView(input);
  if (!result) return null;
  const source = typeof input.toObject === "function" ? input.toObject() : input;
  if (identifier(source.quotationId)) result.quotationId = identifier(source.quotationId);
  if (Number.isSafeInteger(source.revision) && source.revision > 0) result.revision = source.revision;
  if (date(source.acceptedAt)) result.acceptedAt = source.acceptedAt;
  if (date(source.cancellationPolicyAcknowledgedAt)) result.cancellationPolicyAcknowledgedAt = source.cancellationPolicyAcknowledgedAt;
  return result;
}
