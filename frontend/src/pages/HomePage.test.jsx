import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "./HomePage";
import { getVendors } from "../services/vendorService";

vi.mock("../services/vendorService", () => ({ getVendors: vi.fn() }));

const vendor = {
  _id: "vendor-1",
  businessName: "Garden Event Studio",
  serviceCategory: "Decoration",
  location: "Chandigarh",
  pricing: 15000,
  verificationStatus: "approved"
};
function SearchDestination() {
  const { pathname, search } = useLocation();
  return <output aria-label="Vendor results location">{pathname}{search}</output>;
}
const renderHome = () => render(
  <MemoryRouter initialEntries={["/"]}>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/vendors" element={<SearchDestination />} />
    </Routes>
  </MemoryRouter>
);

describe("marketplace homepage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVendors.mockResolvedValue({ vendors: [] });
    vi.stubGlobal("IntersectionObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends trimmed service and city searches to the existing vendor results route", async () => {
    renderHome();
    await screen.findByRole("heading", { name: "Something good is coming" });
    fireEvent.change(screen.getByRole("textbox", { name: "Vendor or service" }), { target: { value: "  floral design  " } });
    fireEvent.change(screen.getByRole("textbox", { name: "Event city" }), { target: { value: "  New Delhi  " } });
    fireEvent.click(screen.getByRole("button", { name: "Explore services" }));
    expect(screen.getByRole("status", { name: "Vendor results location" })).toHaveTextContent("/vendors?search=floral+design&city=New+Delhi");
  });

  it("omits blank search parameters", async () => {
    renderHome();
    await screen.findByRole("heading", { name: "Something good is coming" });
    fireEvent.change(screen.getByRole("textbox", { name: "Vendor or service" }), { target: { value: "   " } });
    fireEvent.change(screen.getByRole("textbox", { name: "Event city" }), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Explore services" }));
    expect(screen.getByRole("status", { name: "Vendor results location" })).toHaveTextContent(/^\/vendors$/);
  });

  it("shows the actual API failure and retries without inserting example vendors", async () => {
    getVendors.mockRejectedValueOnce({ response: { data: { message: "The vendor directory is temporarily unavailable." } } })
      .mockResolvedValueOnce({ vendors: [vendor] });
    renderHome();
    expect(await screen.findByText("The vendor directory is temporarily unavailable.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View details" })).not.toBeInTheDocument();
    expect(screen.queryByText("Find your team in")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading vendors" }));
    expect(await screen.findByRole("heading", { name: vendor.businessName })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View details" })).toHaveAttribute("href", "/vendors/vendor-1");
    expect(getVendors).toHaveBeenCalledTimes(2);
  });

  it("builds unique city shortcuts exclusively from loaded vendor locations", async () => {
    getVendors.mockResolvedValue({ vendors: [
      vendor,
      { ...vendor, _id: "vendor-2", businessName: "Gather Studio", location: "Chandigarh" },
      { ...vendor, _id: "vendor-3", businessName: "Taste Studio", location: "Mohali" },
      { ...vendor, _id: "vendor-4", businessName: "Music Studio", location: "" }
    ] });
    renderHome();
    await screen.findByRole("heading", { name: vendor.businessName });
    const cityLinks = screen.getAllByRole("link").filter(link => link.getAttribute("href")?.startsWith("/vendors?city="));
    expect(cityLinks.map(link => link.getAttribute("href"))).toEqual([
      "/vendors?city=Chandigarh", "/vendors?city=Mohali"
    ]);
    expect(screen.getByRole("link", { name: "Chandigarh" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mohali" })).toBeInTheDocument();
  });

  it("keeps the city shortcuts absent when vendors have no location data", async () => {
    getVendors.mockResolvedValue({ vendors: [{ ...vendor, location: "" }] });
    renderHome();
    await screen.findByRole("heading", { name: vendor.businessName });
    expect(screen.queryByText("Find your team in")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link").some(link => link.getAttribute("href")?.startsWith("/vendors?city="))).toBe(false);
  });
});
