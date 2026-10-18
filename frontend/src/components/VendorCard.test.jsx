import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import VendorCard from "./VendorCard";
describe("VendorCard", () => {
  it("shows real marketplace fields and a working detail link", () => {
    render(<MemoryRouter>
    <VendorCard vendor={{
        _id: "vendor-1",
        businessName: "Celebration Studio",
        serviceCategory: "Decoration",
        location: "Delhi",
        pricing: 50000
      }} />
  </MemoryRouter>);
    expect(screen.getByText("Celebration Studio")).toBeInTheDocument();
    expect(screen.getByText("Delhi")).toBeInTheDocument();
    expect(screen.getByRole("link", {
      name: /View details/i
    })).toHaveAttribute("href", "/vendors/vendor-1");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
