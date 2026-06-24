import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

Object.defineProperty(URL, "createObjectURL", {
  writable: true,
  value: () => "blob:review-preview",
});

Object.defineProperty(URL, "revokeObjectURL", {
  writable: true,
  value: () => {},
});
