import mongoose from "mongoose";

const emailOtpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    requestedAt: { type: Date, required: true },
    attempts: { type: Number, default: 0, min: 0 },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

emailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("EmailOtp", emailOtpSchema);
