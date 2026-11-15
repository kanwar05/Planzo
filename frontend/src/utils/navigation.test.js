import { describe, expect, it } from "vitest";
import { getSafeReturnPath } from "./navigation";

describe("safe authentication return destinations", () => {
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/%2f%2fevil.example", "/%5cevil.example", "/booking/vendor-1?next=https://evil.example", "javascript:alert(1)", "/booking/../login", "/login", "/verify-account-email", { pathname: "/booking/vendor-1" }])("rejects an unsafe or looping destination %j", value => {
    expect(getSafeReturnPath(value, "/customer/dashboard")).toBe("/customer/dashboard");
  });
  it.each(["/booking/vendor-1", "/vendor/profile-setup", "/settings", "/vendors", "/"])("retains known application pathname %s", value => {
    expect(getSafeReturnPath(value)).toBe(value);
  });
});
