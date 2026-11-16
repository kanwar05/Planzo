import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import VendorPackages from "./VendorPackages";
import { getVendorPackages } from "../services/packageService";
vi.mock("../services/packageService", () => ({ getVendorPackages: vi.fn() }));
const id = "1234567890abcdef12345678";
function Destination() { const location = useLocation(); return <p>Selected package: {location.state?.packageId}</p>; }
describe("public service packages", () => {
  it("shows only active packages with advisory price and preserves selection in the booking destination", async () => {
    getVendorPackages.mockResolvedValue([{ _id: id, title: "Garden styling", priceAmount: 10001, pricingUnit: "event", priceType: "starting", includedServices: ["Flowers"], active: true }, { _id: "inactive", title: "Retired styling", active: false }]);
    render(<MemoryRouter><Routes><Route path="/" element={<VendorPackages vendorId="vendor-1" />} /><Route path="/booking/vendor-1" element={<Destination />} /></Routes></MemoryRouter>);
    expect(await screen.findByText(/₹100.01/)).toBeInTheDocument();
    expect(screen.queryByText("Retired styling")).not.toBeInTheDocument();
    expect(screen.getByText(/No price or payment obligation/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Request Garden styling" }));
    expect(await screen.findByText(`Selected package: ${id}`)).toBeInTheDocument();
  });
  it("keeps custom requests available when no packages exist", async () => {
    getVendorPackages.mockResolvedValue([]);
    render(<MemoryRouter><VendorPackages vendorId="vendor-1" /></MemoryRouter>);
    expect(await screen.findByText(/No active packages/)).toBeInTheDocument();
  });
});
