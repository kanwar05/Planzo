import "dotenv/config";
import { validateEnvironment } from "../src/config/environment.js";
import { isStaging } from "../src/config/stagingSafety.js";

// Configuration only: no database connection, SMTP transport or provider calls.
try {
  if (!isStaging()) throw new Error("Staging mode is required.");
  validateEnvironment();
  console.log(JSON.stringify({
    event: "staging_configuration", success: true, scope: "configuration_only",
    checks: ["database_pin", "frontend_origin_pin", "smtp_pin", "recipient_allowlist", "optional_image_isolation"],
  }));
} catch {
  console.error(JSON.stringify({ event: "staging_configuration", success: false, scope: "configuration_only", category: "staging_configuration_invalid" }));
  process.exitCode = 1;
}
