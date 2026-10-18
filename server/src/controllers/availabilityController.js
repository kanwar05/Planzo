import Availability from "../models/Availability.js";
import Vendor from "../models/Vendor.js";
import ApiError from "../utils/ApiError.js";
import { getBookedDates, normalizeDateOnly } from "../utils/availability.js";
import asyncHandler from "../utils/asyncHandler.js";
import { validateObjectId } from "../utils/validation.js";
import { hasActiveVendorOwner } from "../services/vendorSearchService.js";

async function getOwnedVendor(userId) {
  const vendor = await Vendor.findOne({ userId });
  if (!vendor) throw new ApiError(404, "Create a vendor profile before setting availability.");
  return vendor;
}
async function view(vendorId, availability) {
  return { vendorId, availableDates: availability?.availableDates || [],
    unavailableDates: availability?.unavailableDates || [], bookedDates: await getBookedDates(vendorId) };
}

export const getAvailability = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, "vendor id");
  const vendor = await Vendor.findById(req.params.id);
  if (!(await hasActiveVendorOwner(vendor))) throw new ApiError(404, "Vendor not found.");
  const availability = await Availability.findOne({ vendorId: vendor._id });
  res.json({ success: true, availability: await view(vendor._id, availability) });
});

export const getMyAvailability = asyncHandler(async (req, res) => {
  const vendor = await getOwnedVendor(req.user._id);
  const availability = await Availability.findOne({ vendorId: vendor._id });
  res.json({ success: true, availability: await view(vendor._id, availability) });
});

const dates = (input, field) => {
  if (!Array.isArray(input) || input.length > 730) throw new ApiError(400, `${field} must contain at most 730 dates.`);
  return [...new Set(input.map((value) => normalizeDateOnly(value, field)))].sort();
};

export const updateAvailability = asyncHandler(async (req, res) => {
  const vendor = await getOwnedVendor(req.user._id);
  const existing = await Availability.findOne({ vendorId: vendor._id });
  if (req.body.availableDates === undefined && req.body.unavailableDates === undefined) throw new ApiError(400, "Provide availableDates or unavailableDates.");
  const availableDates = req.body.availableDates === undefined ? existing?.availableDates || [] : dates(req.body.availableDates, "availableDates");
  const unavailableDates = req.body.unavailableDates === undefined ? existing?.unavailableDates || [] : dates(req.body.unavailableDates, "unavailableDates");
  if (availableDates.some((date) => unavailableDates.includes(date))) throw new ApiError(400, "A date cannot be both available and unavailable.");
  const bookedDates = await getBookedDates(vendor._id);
  if (unavailableDates.some((date) => bookedDates.includes(date))) throw new ApiError(409, "A booked date cannot be marked unavailable.");
  const availability = await Availability.findOneAndUpdate(
    { vendorId: vendor._id }, { $set: { availableDates, unavailableDates } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  res.json({ success: true, message: "Availability saved.", availability: await view(vendor._id, availability) });
});
export const createAvailability = updateAvailability;

export const deleteAvailability = asyncHandler(async (req, res) => {
  const vendor = await getOwnedVendor(req.user._id);
  await Availability.deleteOne({ vendorId: vendor._id });
  res.json({ success: true, message: "Availability reset.", availability: await view(vendor._id, null) });
});
