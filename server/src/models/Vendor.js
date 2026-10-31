import mongoose from "mongoose";

export const SERVICE_CATEGORIES = [
  "DJ",
  "Catering",
  "Decoration",
  "Venue Booking",
  "Mehndi Artist",
  "Photographer",
  "Event Planner",
  "Rental Services",
];

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    publicId: { type: String, default: "", trim: true },
  },
  { _id: false },
);

// These are opt-in business contacts, never a copy of private User fields.
const contactSchema = new mongoose.Schema(
  {
    phone: { type: String, trim: true, maxlength: 30, default: "" },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 254,
      default: "",
    },
  },
  { _id: false },
);

const vendorSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    businessName: { type: String, required: true, trim: true, maxlength: 120 },
    serviceCategory: { type: String, required: true, enum: SERVICE_CATEGORIES },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    pricing: { type: Number, required: true, min: 0 },
    location: { type: String, required: true, trim: true, maxlength: 160 },
    servicesOffered: {
      type: [{ type: String, trim: true, maxlength: 120 }],
      default: [],
      validate: {
        validator: (items) => items.length <= 20,
        message: "Use at most 20 services.",
      },
    },
    contactDetails: { type: contactSchema, default: () => ({}), select: false },
    profileImage: { type: imageSchema, default: null },
    coverImage: { type: imageSchema, default: null },
    portfolioImages: {
      type: [imageSchema],
      default: [],
      validate: {
        validator: (images) => images.length <= 8,
        message: "A portfolio can contain at most 8 images.",
      },
    },
    verified: { type: Boolean, default: false },
    verificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default() {
        return this.verified ? "approved" : "pending";
      },
    },
    verificationRejectionReason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
    suspended: { type: Boolean, default: false },
    suspendedAt: { type: Date, default: null },
    // Internal transaction guard; never exposed in vendor/booking views.
    bookingRevision: { type: Number, default: 0, select: false },
  },
  { timestamps: true, versionKey: false },
);

vendorSchema.pre("init", function normalizeLegacy(data) {
  if (!data.verificationStatus)
    data.verificationStatus = data.verified ? "approved" : "pending";
  data.portfolioImages = (data.portfolioImages || [])
    .map((image) =>
      typeof image === "string" ? { url: image, publicId: "" } : image,
    )
    .filter((image) => image?.url);
  for (const field of ["profileImage", "coverImage"]) {
    if (typeof data[field] === "string")
      data[field] = { url: data[field], publicId: "" };
  }
});
vendorSchema.pre("save", function syncApproval(next) {
  this.verified = this.verificationStatus === "approved";
  if (this.verified) this.verificationRejectionReason = "";
  next();
});
vendorSchema.index({
  verificationStatus: 1,
  suspended: 1,
  serviceCategory: 1,
  pricing: 1,
});

export default mongoose.model("Vendor", vendorSchema);
