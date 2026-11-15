import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RegisterPage from "./RegisterPage";
import ServicesPage from "./ServicesPage";
import VendorProfilePage from "./VendorProfilePage";
import VendorsPage from "./VendorsPage";
import { useAuth } from "../context/AuthContext";
import { createVendorProfile, getMyVendorProfile, getVendors, updateVendorProfile } from "../services/vendorService";

vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../services/vendorService", () => ({
  createVendorProfile: vi.fn(), getMyVendorProfile: vi.fn(), getVendors: vi.fn(), updateVendorProfile: vi.fn()
}));

const newCategories = [
  "Reel Creator & Editor", "Makeup Artist", "Pre-Wedding Shoot", "Drone Operator", "Rental Supplier"
];
const profile = {
  _id: "vendor-1", businessName: "Event Studio", serviceCategory: "Decoration",
  description: "Thoughtful event services", location: "Delhi", pricing: 10000,
  profileRevision: 3, verificationStatus: "approved", servicesOffered: [], portfolioImages: []
};

describe("additional marketplace service categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ register: vi.fn().mockResolvedValue({ role: "vendor" }) });
    getMyVendorProfile.mockResolvedValue(profile);
    getVendors.mockResolvedValue({ vendors: [], pagination: { total: 0, pages: 1 } });
    vi.stubGlobal("IntersectionObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("preserves every existing service category alongside the five additions", () => {
    render(<MemoryRouter><ServicesPage /></MemoryRouter>);
    const categories = screen.getByRole("region", { name: "Event service categories" });
    const existingCategories = [
      "Venue Booking", "Catering", "DJ", "Decoration", "Mehndi Artist", "Event Planner", "Rental Services", "Photographer"
    ];
    for (const category of [...existingCategories, ...newCategories]) {
      expect(within(categories).getByRole("heading", { name: category, exact: true })).toBeInTheDocument();
    }
    expect(within(categories).getAllByRole("link")).toHaveLength(13);
  });

  it.each(newCategories)("carries %s from vendor registration into a saved onboarding profile", async (category) => {
    getMyVendorProfile.mockRejectedValueOnce({ response: { status: 404 } });
    createVendorProfile.mockResolvedValueOnce({ ...profile, serviceCategory: category, verificationStatus: "pending" });
    render(<MemoryRouter initialEntries={["/register?role=vendor"]}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/vendor/profile-setup" element={<VendorProfilePage />} />
      </Routes>
    </MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Studio Owner" } });
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: profile.businessName } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "owner@example.test" } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "+919999999999" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "SecurePassword1!" } });
    fireEvent.change(screen.getByLabelText("Service category"), { target: { value: category } });
    fireEvent.click(screen.getByRole("button", { name: "Create vendor account" }));

    expect(await screen.findByLabelText("Category")).toHaveValue(category);
    expect(screen.getByLabelText("Business name")).toHaveValue(profile.businessName);
    fireEvent.change(screen.getByLabelText("Business description"), { target: { value: profile.description } });
    fireEvent.change(screen.getByLabelText("Service location"), { target: { value: profile.location } });
    fireEvent.change(screen.getByLabelText("Starting price (INR)"), { target: { value: "10000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save business profile" }));
    await waitFor(() => expect(createVendorProfile).toHaveBeenCalledWith(expect.objectContaining({
      businessName: profile.businessName, serviceCategory: category, pricing: 10000
    })));
    expect(await screen.findByText("Profile saved and submitted for review.")).toBeInTheDocument();
  });

  it.each(newCategories)("lets an existing vendor change their category to %s", async (category) => {
    updateVendorProfile.mockResolvedValueOnce({ ...profile, serviceCategory: category, verificationStatus: "pending", profileRevision: 4 });
    render(<MemoryRouter><VendorProfilePage /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText("Category"), { target: { value: category } });
    fireEvent.click(screen.getByRole("button", { name: "Save business profile" }));
    await waitFor(() => expect(updateVendorProfile).toHaveBeenCalledWith(expect.objectContaining({
      serviceCategory: category, profileRevision: 3
    })));
    expect(await screen.findByText("Profile saved and submitted for review.")).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toHaveValue(category);
  });

  it.each(newCategories)("browses and searches %s through category links, dropdowns and the rail", async (category) => {
    render(<MemoryRouter initialEntries={["/services"]}>
      <Routes>
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/vendors" element={<VendorsPage />} />
      </Routes>
    </MemoryRouter>);
    const link = screen.getByRole("heading", { name: category, exact: true }).closest("a");
    expect(link).toHaveAttribute("href", `/vendors?category=${encodeURIComponent(category)}`);
    fireEvent.click(link);
    await waitFor(() => expect(getVendors).toHaveBeenLastCalledWith(expect.objectContaining({ category }), expect.any(Object)));
    expect(screen.getByLabelText("Category")).toHaveValue(category);

    fireEvent.click(screen.getByRole("button", { name: "All services" }));
    await waitFor(() => expect(getVendors).toHaveBeenLastCalledWith(expect.objectContaining({ category: undefined }), expect.any(Object)));
    const select = screen.getByLabelText("Category");
    expect(within(select).getByRole("option", { name: "Rental Services", exact: true })).toHaveValue("Rental Services");
    fireEvent.change(select, { target: { value: category } });
    fireEvent.change(screen.getByLabelText("Vendor or service"), { target: { value: " Studio " } });
    fireEvent.click(screen.getByRole("button", { name: "Search", exact: true }));
    await waitFor(() => expect(getVendors).toHaveBeenLastCalledWith(expect.objectContaining({ category, search: "Studio" }), expect.any(Object)));

    fireEvent.click(screen.getByRole("button", { name: "All services" }));
    await waitFor(() => expect(getVendors).toHaveBeenLastCalledWith(expect.objectContaining({ category: undefined, search: "Studio" }), expect.any(Object)));
    fireEvent.click(screen.getByRole("button", { name: category, exact: true }));
    await waitFor(() => expect(getVendors).toHaveBeenLastCalledWith(expect.objectContaining({ category, search: "Studio" }), expect.any(Object)));
    expect(screen.getByRole("button", { name: category, exact: true })).toHaveAttribute("aria-pressed", "true");
  });
});
