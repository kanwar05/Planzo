import mongoose from "mongoose";

export const SERVICE_CATEGORIES = [
  "DJ",
  "Catering",
  "Decoration",
  "Venue Booking",
  "Mehndi Artist",
  "Event Planner",
  "Rental Services",
];

const cloudinaryImageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: [true, "Image URL is required."],
      trim: true,
    },
    publicId: {
      type: String,
      default: "",
      trim: true,
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
      index: true,
    },
    businessName: {
      type: String,
      required: [true, "Business name is required."],
      trim: true,
      maxlength: [120, "Business name cannot exceed 120 characters."],
    },
    serviceCategory: {
      type: String,
      required: [true, "Service category is required."],
      enum: SERVICE_CATEGORIES,
    },
    description: {
      type: String,
      required: [true, "Description is required."],
      trim: true,
      maxlength: [2000, "Description cannot exceed 2000 characters."],
    },
    experience: {
      type: Number,
      min: [0, "Experience cannot be negative."],
      default: 0,
    },
    pricing: {
      type: Number,
      required: [true, "Pricing is required."],
      min: [0, "Pricing cannot be negative."],
    },
    location: {
      type: String,
      required: [true, "Location is required."],
      trim: true,
      maxlength: [160, "Location cannot exceed 160 characters."],
    },
    profileImage: {
      type: cloudinaryImageSchema,
      default: null,
    },
    coverImage: {
      type: cloudinaryImageSchema,
      default: null,
    },
    portfolioImages: {
      type: [cloudinaryImageSchema],
      default: [],
      validate: {
        validator: (images) => images.length <= 8,
        message: "A portfolio can contain at most 8 images.",
      },
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    reviewsCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    verified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Convert portfolios created before Cloudinary support into the new object shape
// as documents are hydrated, so existing profiles remain readable and editable.
vendorSchema.pre("init", function normalizeLegacyPortfolio(data) {
  if (Array.isArray(data.portfolioImages)) {
    data.portfolioImages = data.portfolioImages
      .map((image) =>
        typeof image === "string" ? { url: image, publicId: "" } : image,
      )
      .filter((image) => image?.url);
  }

  for (const field of ["profileImage", "coverImage"]) {
    if (typeof data[field] === "string") {
      data[field] = { url: data[field], publicId: "" };
    }
  }
});

vendorSchema.index({
  businessName: "text",
  serviceCategory: "text",
  description: "text",
  location: "text",
});

export default mongoose.model("Vendor", vendorSchema);
