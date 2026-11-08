import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required."],
      trim: true,
      minlength: [2, "Name must be at least 2 characters."],
      maxlength: [80, "Name cannot exceed 80 characters."],
    },
    email: {
      type: String,
      required: [true, "Email is required."],
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required."],
      trim: true,
      minlength: [7, "Phone number is too short."],
      maxlength: [20, "Phone number is too long."],
    },
    password: {
      type: String,
      required: [true, "Password is required."],
      minlength: [8, "Password must be at least 8 characters."],
      select: false,
    },
    role: {
      type: String,
      enum: ["customer", "vendor", "admin"],
      default: "customer",
    },
    authVersion: { type: Number, default: 0, min: 0 },
    accountStatus: {
      type: String,
      enum: ["active", "deactivated"],
      default: "active",
    },
    deactivatedAt: { type: Date, default: null },
    suspendedAt: { type: Date, default: null },
    suspensionReason: { type: String, default: "" },
    passwordResetTokenHash: {
      type: String,
      select: false,
      default: undefined,
    },
    passwordResetExpiresAt: {
      type: Date,
      select: false,
      default: undefined,
    },
    pendingEmail: { type: String, select: false, default: undefined },
    emailChangeTokenHash: { type: String, select: false, default: undefined },
    emailChangeExpiresAt: { type: Date, select: false, default: undefined },
    passwordChangedAt: {
      type: Date,
      default: undefined,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(doc, value) {
        for (const field of [
          "password",
          "authVersion",
          "passwordResetTokenHash",
          "passwordResetExpiresAt",
          "passwordResetConsumedAt",
          "pendingEmail",
          "emailChangeTokenHash",
          "emailChangeExpiresAt",
          "notificationPreferences",
          "lastSeenAt",
        ]) {
          delete value[field];
        }
        return value;
      },
    },
  },
);

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();

  this.password = await bcrypt.hash(this.password, 12);
  return next();
});

userSchema.methods.comparePassword = function comparePassword(
  candidatePassword,
) {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model("User", userSchema);
