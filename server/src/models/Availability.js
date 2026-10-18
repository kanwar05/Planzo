import mongoose from "mongoose";

const dateList = { type: [String], default: [], validate: {
  validator: (dates) => dates.length <= 730 && dates.every((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }), message: "Provide at most 730 valid YYYY-MM-DD dates.",
} };
const availabilitySchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true, unique: true },
  availableDates: dateList,
  unavailableDates: dateList,
}, { timestamps: true, versionKey: false });

// Keep full-day legacy blocks readable without retaining appointment scheduling.
availabilitySchema.pre("init", function normalizeLegacy(data) {
  if (!data.unavailableDates) data.unavailableDates = (data.blockedDates || []).map((item) => item.date).filter(Boolean);
});
export default mongoose.model("Availability", availabilitySchema);
