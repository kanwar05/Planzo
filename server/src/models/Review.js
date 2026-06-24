import mongoose from "mongoose";

const reviewImageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: [true, "Review image URL is required."],
      trim: true,
    },
    publicId: {
      type: String,
      required: [true, "Review image public id is required."],
      trim: true,
    },
  },
  { _id: false },
);

const vendorReplySchema = new mongoose.Schema(
  {
    message: {
      type: String,
      trim: true,
      maxlength: [1000, "Vendor reply cannot exceed 1000 characters."],
    },
    repliedAt: {
      type: Date,
    },
  },
  { _id: false },
);

const reviewSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      unique: true,
      index: true,
    },
    rating: {
      type: Number,
      required: [true, "Rating is required."],
      min: [1, "Rating must be at least 1."],
      max: [5, "Rating cannot exceed 5."],
      validate: {
        validator: Number.isInteger,
        message: "Rating must be a whole number.",
      },
    },
    comment: {
      type: String,
      required: [true, "Comment is required."],
      trim: true,
      minlength: [3, "Comment must be at least 3 characters."],
      maxlength: [2000, "Comment cannot exceed 2000 characters."],
    },
    images: {
      type: [reviewImageSchema],
      default: [],
      validate: {
        validator: (images) => images.length <= 4,
        message: "A review can contain at most 4 images.",
      },
    },
    vendorReply: {
      type: vendorReplySchema,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

reviewSchema.index({ vendorId: 1, createdAt: -1 });

export default mongoose.model("Review", reviewSchema);
