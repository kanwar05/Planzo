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
    moderationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    moderationReason: { type: String, trim: true, maxlength: 500, default: null },
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
    editedAt: { type: Date, default: null },
    history: {
      type: [{
        message: { type: String, required: true },
        changedAt: { type: Date, default: Date.now },
      }],
      default: [],
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
    status: {
      type: String,
      enum: ["active", "flagged", "hidden", "removed"],
      default: "active",
      index: true,
    },
    flaggedAt: {
      type: Date,
      default: null,
    },
    moderationReason: {
      type: String,
      trim: true,
      maxlength: [500, "Moderation reason cannot exceed 500 characters."],
      default: null,
    },
    reports: {
      type: [{
        reporterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        reason: { type: String, required: true, trim: true, maxlength: 500 },
        createdAt: { type: Date, default: Date.now },
      }],
      default: [],
    },
    appeal: {
      type: {
        message: { type: String, required: true, trim: true, maxlength: 1000 },
        status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
        submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        submittedAt: { type: Date, default: Date.now },
        decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        decidedAt: { type: Date, default: null },
        decisionReason: { type: String, trim: true, maxlength: 500, default: null },
      },
      default: null,
    },
    automatedModeration: {
      profanity: { type: [String], default: [] },
      spamReasons: { type: [String], default: [] },
      checkedAt: { type: Date, default: null },
    },
    moderationHistory: {
      type: [{
        action: { type: String, required: true },
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        actorRole: { type: String, default: "system" },
        fromStatus: { type: String, default: null },
        toStatus: { type: String, default: null },
        reason: { type: String, maxlength: 500, default: null },
        details: { type: mongoose.Schema.Types.Mixed, default: null },
        createdAt: { type: Date, default: Date.now },
      }],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

reviewSchema.index({ vendorId: 1, createdAt: -1 });
reviewSchema.index({ status: 1, "appeal.status": 1, flaggedAt: -1 });

export default mongoose.model("Review", reviewSchema);
