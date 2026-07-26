import mongoose from "mongoose";

const accountSettingsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    notifications: {
      bookingUpdates: { type: Boolean, default: true },
      reviewReminders: { type: Boolean, default: true },
      promotions: { type: Boolean, default: false },
      productUpdates: { type: Boolean, default: true },
    },
    email: {
      enabled: { type: Boolean, default: true },
      bookingUpdates: { type: Boolean, default: true },
      promotions: { type: Boolean, default: false },
      newsletter: { type: Boolean, default: false },
    },
    sms: {
      enabled: { type: Boolean, default: true },
      bookingUpdates: { type: Boolean, default: true },
      securityAlerts: { type: Boolean, default: true },
      promotions: { type: Boolean, default: false },
    },
    privacy: {
      profileVisibility: {
        type: String,
        enum: ["public", "members", "private"],
        default: "members",
      },
      showOnlineStatus: { type: Boolean, default: true },
      allowSearchEngines: { type: Boolean, default: false },
      dataPersonalization: { type: Boolean, default: true },
    },
    theme: {
      mode: {
        type: String,
        enum: ["light", "dark", "system"],
        default: "system",
      },
      reducedMotion: { type: Boolean, default: false },
    },
  },
  { timestamps: true, versionKey: false },
);

export default mongoose.model("AccountSettings", accountSettingsSchema);
