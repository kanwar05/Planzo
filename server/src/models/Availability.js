import mongoose from "mongoose";

export const DEFAULT_BUSINESS_HOURS = [
  { dayOfWeek: 0, isOpen: false, startTime: "10:00", endTime: "18:00" },
  { dayOfWeek: 1, isOpen: true, startTime: "10:00", endTime: "18:00" },
  { dayOfWeek: 2, isOpen: true, startTime: "10:00", endTime: "18:00" },
  { dayOfWeek: 3, isOpen: true, startTime: "10:00", endTime: "18:00" },
  { dayOfWeek: 4, isOpen: true, startTime: "10:00", endTime: "18:00" },
  { dayOfWeek: 5, isOpen: true, startTime: "10:00", endTime: "18:00" },
  { dayOfWeek: 6, isOpen: true, startTime: "10:00", endTime: "16:00" },
];

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const businessHourSchema = new mongoose.Schema(
  {
    dayOfWeek: {
      type: Number,
      min: 0,
      max: 6,
      required: true,
    },
    isOpen: {
      type: Boolean,
      default: true,
    },
    startTime: {
      type: String,
      default: "10:00",
      match: timePattern,
    },
    endTime: {
      type: String,
      default: "18:00",
      match: timePattern,
    },
  },
  { _id: false },
);

const datedBlockSchema = new mongoose.Schema(
  {
    date: {
      type: String,
      required: true,
      match: datePattern,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 160,
      default: "",
    },
    type: {
      type: String,
      enum: ["blocked", "holiday"],
      default: "blocked",
    },
  },
  { timestamps: true, versionKey: false },
);

const timeSlotBlockSchema = new mongoose.Schema(
  {
    date: {
      type: String,
      required: true,
      match: datePattern,
    },
    startTime: {
      type: String,
      required: true,
      match: timePattern,
    },
    endTime: {
      type: String,
      required: true,
      match: timePattern,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 160,
      default: "",
    },
  },
  { timestamps: true, versionKey: false },
);

const vacationSchema = new mongoose.Schema(
  {
    startDate: {
      type: String,
      required: true,
      match: datePattern,
    },
    endDate: {
      type: String,
      required: true,
      match: datePattern,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 160,
      default: "",
    },
  },
  { timestamps: true, versionKey: false },
);

const availabilitySchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      unique: true,
      index: true,
    },
    timezone: {
      type: String,
      trim: true,
      default: "Asia/Kolkata",
    },
    slotDurationMinutes: {
      type: Number,
      min: 15,
      max: 480,
      default: 60,
    },
    businessHours: {
      type: [businessHourSchema],
      default: () => DEFAULT_BUSINESS_HOURS,
    },
    blockedDates: {
      type: [datedBlockSchema],
      default: [],
    },
    blockedTimeSlots: {
      type: [timeSlotBlockSchema],
      default: [],
    },
    vacations: {
      type: [vacationSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

availabilitySchema.index({ vendorId: 1, "blockedDates.date": 1 });
availabilitySchema.index({ vendorId: 1, "blockedTimeSlots.date": 1 });
availabilitySchema.index({ vendorId: 1, "vacations.startDate": 1 });

export default mongoose.model("Availability", availabilitySchema);
