import Availability, {
  DEFAULT_BUSINESS_HOURS,
} from "../models/Availability.js";
import Vendor from "../models/Vendor.js";
import ApiError from "../utils/ApiError.js";
import {
  assertTime,
  assertTimeRange,
  buildAvailableSlots,
  getBookedSlots,
  getOrCreateAvailability,
  normalizeDateOnly,
} from "../utils/availability.js";
import asyncHandler from "../utils/asyncHandler.js";
import { validateObjectId } from "../utils/validation.js";

const VALID_DAYS = new Set([0, 1, 2, 3, 4, 5, 6]);

const getOwnedVendor = async (userId) => {
  const vendor = await Vendor.findOne({ userId });
  if (!vendor) {
    throw new ApiError(404, "Create a vendor profile before setting availability.");
  }

  return vendor;
};

const normalizeBusinessHours = (items = DEFAULT_BUSINESS_HOURS) => {
  const seen = new Set();

  return items.map((item) => {
    const dayOfWeek = Number(item.dayOfWeek);
    if (!VALID_DAYS.has(dayOfWeek) || seen.has(dayOfWeek)) {
      throw new ApiError(400, "Business hours must contain unique days 0 through 6.");
    }
    seen.add(dayOfWeek);

    const startTime = assertTime(item.startTime || "10:00", "Start time");
    const endTime = assertTime(item.endTime || "18:00", "End time");
    if (item.isOpen !== false) assertTimeRange(startTime, endTime);

    return {
      dayOfWeek,
      isOpen: item.isOpen !== false,
      startTime,
      endTime,
    };
  });
};

const normalizeBlockedDates = (items = []) =>
  items.map((item) => ({
    date: normalizeDateOnly(item.date),
    reason: item.reason || "",
    type: item.type === "holiday" ? "holiday" : "blocked",
  }));

const normalizeBlockedTimeSlots = (items = []) =>
  items.map((item) => {
    const date = normalizeDateOnly(item.date);
    const startTime = assertTime(item.startTime, "Start time");
    const endTime = assertTime(item.endTime, "End time");
    assertTimeRange(startTime, endTime);

    return {
      date,
      startTime,
      endTime,
      reason: item.reason || "",
    };
  });

const normalizeVacations = (items = []) =>
  items.map((item) => {
    const startDate = normalizeDateOnly(item.startDate, "vacation start date");
    const endDate = normalizeDateOnly(item.endDate, "vacation end date");
    if (startDate > endDate) {
      throw new ApiError(400, "Vacation start date must be before end date.");
    }

    return {
      startDate,
      endDate,
      reason: item.reason || "",
    };
  });

const serializeAvailability = async (availability) => {
  const plain = availability.toObject();
  const activeBookings = await getBookedSlots(
    plain.vendorId,
    new Date().toISOString().slice(0, 10),
  );

  return {
    ...plain,
    bookedTodayCount: activeBookings.length,
  };
};

export const getAvailability = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, "vendor id");

  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) throw new ApiError(404, "Vendor not found.");

  const availability = await getOrCreateAvailability(vendor._id);
  const date = req.query.date
    ? normalizeDateOnly(req.query.date)
    : new Date().toISOString().slice(0, 10);
  const bookedSlots = await getBookedSlots(vendor._id, date);
  const availableSlots = buildAvailableSlots(availability, date, bookedSlots);

  res.status(200).json({
    success: true,
    availability,
    date,
    availableSlots,
    bookedSlots,
  });
});

export const createAvailability = asyncHandler(async (req, res) => {
  const vendor = await getOwnedVendor(req.user._id);
  const existing = await Availability.findOne({ vendorId: vendor._id });
  if (existing) {
    throw new ApiError(409, "Availability already exists. Use PUT to update it.");
  }

  const availability = await Availability.create({
    vendorId: vendor._id,
    timezone: req.body.timezone || "Asia/Kolkata",
    slotDurationMinutes: req.body.slotDurationMinutes || 60,
    businessHours: normalizeBusinessHours(req.body.businessHours),
    blockedDates: normalizeBlockedDates(req.body.blockedDates),
    blockedTimeSlots: normalizeBlockedTimeSlots(req.body.blockedTimeSlots),
    vacations: normalizeVacations(req.body.vacations),
  });

  res.status(201).json({
    success: true,
    message: "Availability created successfully.",
    availability: await serializeAvailability(availability),
  });
});

export const updateAvailability = asyncHandler(async (req, res) => {
  const vendor = await getOwnedVendor(req.user._id);
  const updates = {};

  if (req.body.timezone !== undefined) {
    updates.timezone = String(req.body.timezone).trim() || "Asia/Kolkata";
  }
  if (req.body.slotDurationMinutes !== undefined) {
    const duration = Number(req.body.slotDurationMinutes);
    if (!Number.isFinite(duration) || duration < 15 || duration > 480) {
      throw new ApiError(400, "Slot duration must be between 15 and 480 minutes.");
    }
    updates.slotDurationMinutes = duration;
  }
  if (req.body.businessHours !== undefined) {
    updates.businessHours = normalizeBusinessHours(req.body.businessHours);
  }
  if (req.body.blockedDates !== undefined) {
    updates.blockedDates = normalizeBlockedDates(req.body.blockedDates);
  }
  if (req.body.blockedTimeSlots !== undefined) {
    updates.blockedTimeSlots = normalizeBlockedTimeSlots(req.body.blockedTimeSlots);
  }
  if (req.body.vacations !== undefined) {
    updates.vacations = normalizeVacations(req.body.vacations);
  }

  const availability = await Availability.findOneAndUpdate(
    { vendorId: vendor._id },
    {
      $set: updates,
      $setOnInsert: { vendorId: vendor._id },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );

  res.status(200).json({
    success: true,
    message: "Availability updated successfully.",
    availability: await serializeAvailability(availability),
  });
});

export const deleteAvailability = asyncHandler(async (req, res) => {
  const vendor = await getOwnedVendor(req.user._id);
  const availability = await getOrCreateAvailability(vendor._id);
  const { type, id } = req.body || {};

  if (!type) {
    await Availability.deleteOne({ vendorId: vendor._id });
    return res.status(200).json({
      success: true,
      message: "Availability settings reset successfully.",
    });
  }

  const collectionMap = {
    blockedDate: "blockedDates",
    blockedTimeSlot: "blockedTimeSlots",
    vacation: "vacations",
  };
  const collection = collectionMap[type];
  if (!collection || !id) {
    throw new ApiError(
      400,
      "Provide type blockedDate, blockedTimeSlot, or vacation with an id.",
    );
  }

  availability[collection] = availability[collection].filter(
    (item) => String(item._id) !== String(id),
  );
  await availability.save();

  return res.status(200).json({
    success: true,
    message: "Availability item deleted successfully.",
    availability: await serializeAvailability(availability),
  });
});
