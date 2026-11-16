import { describe, expect, it } from "vitest";
import { validatePublicBuildEnvironment } from "../../scripts/public-env.mjs";

describe("public frontend build configuration", () => {
  it("accepts the explicit public HTTPS API endpoint", () => {
    expect(validatePublicBuildEnvironment({ VITE_API_URL: "https://api.staging.example.invalid/api", MODE: "production" }))
      .toBe("https://api.staging.example.invalid/api");
  });
  it("accepts Vercel's public observability configuration alongside the API URL", () => {
    expect(validatePublicBuildEnvironment({
      VITE_API_URL: "https://api.staging.example.invalid/api",
      VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG: '{"public":"observability"}',
    })).toBe("https://api.staging.example.invalid/api");
  });
  it.each([undefined, "", "http://localhost:5001/api", "javascript:alert(1)", "https://user:password@example.invalid/api", "https://api.example.invalid/api?token=private", "https://api.example.invalid/api#private"])("refuses unsafe public API configuration", (value) => {
    expect(() => validatePublicBuildEnvironment({ VITE_API_URL: value })).toThrow();
  });
  it("identifies an unapproved public variable without printing its value", () => {
    expect(() => validatePublicBuildEnvironment({ VITE_API_URL: "https://api.example.invalid/api", VITE_PRIVATE_SECRET: "private-sentinel" }))
      .toThrow(/^Unapproved public frontend variables: VITE_PRIVATE_SECRET$/);
  });
});
