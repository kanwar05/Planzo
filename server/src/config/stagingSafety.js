import { validateEmail } from "../utils/validation.js";

const STAGING_ASSET_PREFIX = "eventifyy/staging/";
const stagingName = (value) => /(^|[._-])staging([._-]|$)/i.test(value || "") &&
  !/(^|[._-])(?:prod|production|live)([._-]|$)/i.test(value || "");
function singleAddress(value) {
  if (typeof value !== "string" || /[()*]/.test(value) || !/^[\x21-\x7e]+$/.test(value)) return false;
  try { validateEmail(value); return true; } catch { return false; }
}
const refused = () => Object.assign(new Error("Staging isolation configuration is invalid or the operation is not allowed."), { code: "STAGING_ISOLATION" });
export const isStaging = (env = process.env) => env.APP_ENV === "staging";

export function assertStagingDatabase(env = process.env) {
  if (!isStaging(env)) {
    if (env.STAGING_MONGO_HOST || env.STAGING_DATABASE_NAME) throw refused();
    return;
  }
  let uri;
  try { uri = new URL(env.MONGODB_URI); } catch { throw refused(); }
  const database = uri.pathname.slice(1);
  if (!/^mongodb(?:\+srv)?:$/.test(uri.protocol) ||
      !env.STAGING_MONGO_HOST || uri.hostname.toLowerCase() !== env.STAGING_MONGO_HOST.toLowerCase() ||
      !/^[a-z][a-z0-9_-]{0,62}$/.test(database) || !stagingName(database) ||
      database !== env.STAGING_DATABASE_NAME ||
      [...uri.searchParams.keys()].some((key) => ["dbname", "loadbalanced"].includes(key.toLowerCase()))) throw refused();
}

function recipients(env) {
  const entries = (env.STAGING_EMAIL_RECIPIENTS || "").split(",").map((value) => value.trim().toLowerCase());
  if (!entries.length || entries.length > 10 || entries.some((value) => !singleAddress(value))) throw refused();
  return new Set(entries);
}

export function assertStagingEmailRecipient(recipient, env = process.env) {
  if (!isStaging(env)) return;
  if (env.STAGING_EMAIL_MODE !== "sandbox" || !env.STAGING_SMTP_HOST ||
      env.SMTP_HOST?.toLowerCase() !== env.STAGING_SMTP_HOST.toLowerCase() ||
      typeof recipient !== "string" || !singleAddress(recipient.trim()) ||
      !recipients(env).has(recipient.trim().toLowerCase())) throw refused();
}

export function assertStagingCloudinary(env = process.env) {
  if (!isStaging(env)) return;
  if (!env.STAGING_CLOUDINARY_CLOUD_NAME ||
      env.CLOUDINARY_CLOUD_NAME !== env.STAGING_CLOUDINARY_CLOUD_NAME) throw refused();
}

export function imageFolder(folder, env = process.env) {
  if (!isStaging(env)) return folder;
  assertStagingCloudinary(env);
  return STAGING_ASSET_PREFIX + folder.replace(/^eventifyy\//, "");
}

export function assertStagingImageDeletion(publicId, env = process.env) {
  if (!isStaging(env)) return;
  assertStagingCloudinary(env);
  if (typeof publicId !== "string" || !publicId.startsWith(STAGING_ASSET_PREFIX) ||
      !/^[a-zA-Z0-9/_-]+$/.test(publicId)) throw refused();
}

export function validateStagingEnvironment(env = process.env) {
  if (env.APP_ENV && !["development", "test", "staging", "production"].includes(env.APP_ENV)) throw refused();
  assertStagingDatabase(env);
  if (!isStaging(env)) return;
  if (!["production", "test"].includes(env.NODE_ENV)) throw refused();
  let frontend;
  try { frontend = new URL(env.STAGING_FRONTEND_ORIGIN); } catch { throw refused(); }
  if (frontend.protocol !== "https:" || frontend.origin !== env.STAGING_FRONTEND_ORIGIN ||
      !stagingName(frontend.hostname) || env.CLIENT_URL !== frontend.origin) throw refused();
  const allowed = recipients(env);
  assertStagingEmailRecipient([...allowed][0], env);
  if (["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"].some((key) => env[key])) assertStagingCloudinary(env);
}

