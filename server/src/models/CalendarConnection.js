import mongoose from "mongoose";

const calendarConnectionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    provider: { type: String, enum: ["google"], default: "google" },
    email: { type: String, trim: true, default: "" },
    calendarId: { type: String, trim: true, default: "primary" },
    refreshTokenEncrypted: { type: String, required: true, select: false },
    scopes: [{ type: String }],
    connectedAt: { type: Date, default: Date.now },
    lastSyncedAt: { type: Date, default: null },
    lastSyncStatus: {
      type: String,
      enum: ["never", "syncing", "success", "partial", "error"],
      default: "never",
    },
    lastSyncError: { type: String, default: "" },
    syncEnabled: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

export default mongoose.model("CalendarConnection", calendarConnectionSchema);
