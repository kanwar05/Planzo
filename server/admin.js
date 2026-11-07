import "dotenv/config";
import mongoose from "mongoose";
import User from "./src/models/User.js";
import { databaseConnectionOptions } from "./src/config/database.js";
import { errorCategory, logEvent } from "./src/utils/logger.js";

async function createAdmin() {
  const fields = [
    "ADMIN_NAME",
    "ADMIN_EMAIL",
    "ADMIN_PHONE",
    "ADMIN_PASSWORD",
    "MONGODB_URI",
  ];
  const missing = fields.filter((key) => !process.env[key]);
  if (missing.length)
    throw new Error(`Set ${missing.join(", ")} before provisioning an admin.`);
  const password = process.env.ADMIN_PASSWORD;
  if (
    password.length < 8 ||
    password.length > 128 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    throw new Error(
      "Use an admin password of 8–128 characters with upper/lowercase letters, a number, and a symbol.",
    );
  }
  const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("ADMIN_EMAIL is invalid.");
  await mongoose.connect(process.env.MONGODB_URI, databaseConnectionOptions());
  if (await User.exists({ email }))
    throw new Error(
      "An account already exists for ADMIN_EMAIL; no role or password was changed.",
    );
  await User.create({
    name: process.env.ADMIN_NAME.trim(),
    email,
    phone: process.env.ADMIN_PHONE.trim(),
    password,
    role: "admin",
  });
  console.log(
    "Planzo administrator created. Clear ADMIN_PASSWORD from the environment after provisioning.",
  );
}

createAdmin()
  .catch((error) => {
    logEvent("error", "admin_provision_failed", { category: errorCategory(error) });
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await mongoose.disconnect(); }
    catch { logEvent("error", "admin_provision_cleanup_failed"); process.exitCode = 1; }
  });
