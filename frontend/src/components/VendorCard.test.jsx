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
    expect(screen.getByText("Category inspiration")).toBeInTheDocument();
    expect(screen.getByRole("link", {
      name: /View details/i
    })).toHaveAttribute("href", "/vendors/vendor-1");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("labels manual listing approval accurately and shows service coverage without contacts", () => {
    render(<MemoryRouter><VendorCard vendor={{
      _id: "approved", businessName: "Approved Studio", serviceCategory: "Decoration", location: "Delhi",
      pricing: 0, verificationStatus: "approved", serviceAreas: ["Delhi", "Noida"],
      contactDetails: { email: "private@example.test", phone: "9999999999" }
    }} /></MemoryRouter>);
    expect(screen.getByText("Approved listing")).toHaveAttribute("title", expect.stringContaining("Manually approved"));
    expect(screen.queryByText(/Verified vendor/i)).not.toBeInTheDocument();
    expect(screen.getByText("Serves Delhi, Noida")).toBeInTheDocument();
    expect(screen.queryByText("private@example.test")).not.toBeInTheDocument();
    expect(screen.queryByText("9999999999")).not.toBeInTheDocument();
  });
});
