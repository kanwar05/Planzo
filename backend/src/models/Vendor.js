import mongoose from "mongoose";

const vendorSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    businessName: { type: String, required: true, trim: true },
    serviceCategory: {
      type: String,
      required: true,
      enum: ["Venue Booking", "Catering", "DJ", "Decoration", "Mehndi Artist", "Event Planner", "Rental Services"],
    },
    description: { type: String, default: "" },
    experience: { type: Number, min: 0, default: 0 },
    startingPrice: { type: Number, min: 0, required: true },
    location: { type: String, required: true, trim: true },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    portfolio: [{ type: String }],
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.model("Vendor", vendorSchema);

