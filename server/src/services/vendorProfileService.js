import { SERVICE_CATEGORIES } from "../models/Vendor.js";
import ApiError from "../utils/ApiError.js";
import { pick, validateEmail } from "../utils/validation.js";

const textLimits = { businessName: 120, serviceCategory: 120, description: 2000, location: 160, city: 100 };
const editable = [...Object.keys(textLimits), "pricing", "servicesOffered", "serviceAreas", "contactDetails"];
const materialFields = ["businessName", "serviceCategory", "description", "location", "city", "serviceAreas", "servicesOffered", "profileImage", "coverImage", "portfolioImages"];

export function normalizeVendorInput(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "Provide a vendor profile object.");
  const data = pick(body, editable);
  for (const [key, limit] of Object.entries(textLimits)) {
    if (data[key] === undefined) continue;
    if (typeof data[key] !== "string" || (key !== "city" && !data[key].trim()) || data[key].trim().length > limit)
      throw new ApiError(400, `${key} must be text up to ${limit} characters${key === "city" ? "." : " and cannot be empty."}`);
    data[key] = data[key].trim();
  }
  if (data.serviceCategory !== undefined && !SERVICE_CATEGORIES.includes(data.serviceCategory))
    throw new ApiError(400, "Choose a valid service category.");
  if (data.pricing !== undefined) {
    if (!["string", "number"].includes(typeof data.pricing) || String(data.pricing).trim() === "" || !Number.isFinite(Number(data.pricing)) || Number(data.pricing) < 0)
      throw new ApiError(400, "Pricing must be a non-negative number.");
    data.pricing = Number(data.pricing);
  }
  for (const key of ["servicesOffered", "serviceAreas"]) {
    if (data[key] === undefined) continue;
    if (!Array.isArray(data[key]) || data[key].length > 20 || data[key].some((value) => typeof value !== "string" || !value.trim() || value.trim().length > 120))
      throw new ApiError(400, `${key} must contain at most 20 non-empty items up to 120 characters each.`);
    data[key] = [...new Set(data[key].map((value) => value.trim()))];
  }
  if (data.contactDetails !== undefined) {
    if (!data.contactDetails || typeof data.contactDetails !== "object" || Array.isArray(data.contactDetails)) throw new ApiError(400, "Contact details must be an object.");
    const contact = {};
    for (const key of ["phone", "email"]) {
      if (data.contactDetails[key] === undefined) continue;
      if (typeof data.contactDetails[key] !== "string") throw new ApiError(400, "Business contacts must be text.");
      contact[key] = data.contactDetails[key].trim();
    }
    if (contact.email) { validateEmail(contact.email); contact.email = contact.email.toLowerCase(); }
    if (contact.phone && !/^[+()0-9 .-]{7,30}$/.test(contact.phone)) throw new ApiError(400, "Please provide a valid business phone number.");
    data.contactDetails = contact;
  }
  return data;
}

export function vendorProfileCompletion(vendor) {
  const missingFields = Object.entries({
    businessName: typeof vendor?.businessName === "string" && Boolean(vendor.businessName.trim()) && vendor.businessName.length <= 120,
    serviceCategory: SERVICE_CATEGORIES.includes(vendor?.serviceCategory),
    description: typeof vendor?.description === "string" && Boolean(vendor.description.trim()) && vendor.description.length <= 2000,
    location: typeof vendor?.location === "string" && Boolean(vendor.location.trim()) && vendor.location.length <= 160,
    pricing: typeof vendor?.pricing === "number" && Number.isFinite(vendor.pricing) && vendor.pricing >= 0,
  }).filter(([, valid]) => !valid).map(([key]) => key);
  return { percent: Math.round((5 - missingFields.length) / 5 * 100), readyForReview: missingFields.length === 0, missingFields };
}

export function assertReviewableVendor(vendor) {
  const completion = vendorProfileCompletion(vendor);
  if (!completion.readyForReview) throw new ApiError(400, "Complete the required business profile fields before approval.", { missingFields: completion.missingFields });
}

export function vendorRevisionFilter(vendorOrRevision) {
  const revision = typeof vendorOrRevision === "number" ? vendorOrRevision : vendorOrRevision?.profileRevision || 0;
  return revision === 0 ? { $or: [{ profileRevision: 0 }, { profileRevision: { $exists: false } }] } : { profileRevision: revision };
}

export function assertExpectedVendorRevision(body, vendor) {
  if (body.profileRevision === undefined) return;
  if (!Number.isSafeInteger(body.profileRevision) || body.profileRevision < 0) throw new ApiError(400, "profileRevision must be a non-negative integer.");
  if (body.profileRevision !== (vendor.profileRevision || 0)) throw new ApiError(409, "The profile changed. Reload it before saving or reviewing.");
}

export function vendorReviewChanges(vendor, changes) {
  const source = vendor.toObject ? vendor.toObject() : vendor;
  const cityForLocation = (location) => typeof location === "string" ? location.split(",")[0].trim() : "";
  source.city ||= cityForLocation(source.location);
  const comparable = { ...changes };
  if ("city" in comparable) comparable.city ||= cityForLocation(comparable.location ?? source.location);
  const material = materialFields.some((key) => key in comparable && JSON.stringify(source[key] ?? (Array.isArray(comparable[key]) ? [] : "")) !== JSON.stringify(comparable[key]));
  if (vendor.verificationStatus === "rejected" || (vendor.verificationStatus === "approved" && material))
    return { verificationStatus: "pending", verified: false, verificationRejectionReason: "" };
  return {};
}
