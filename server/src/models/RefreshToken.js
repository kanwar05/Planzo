import mongoose from "mongoose";

const refreshTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    device: {
      type: { type: String, default: "Unknown device" },
      browser: { type: String, default: "Unknown browser" },
      ip: { type: String, default: "Unknown" },
    },
    lastUsedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export default mongoose.model("RefreshToken", refreshTokenSchema);
