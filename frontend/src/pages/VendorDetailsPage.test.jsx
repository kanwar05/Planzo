import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VendorDetailsPage from "./VendorDetailsPage";
import { getVendorById } from "../services/vendorService";
import { getVendorAvailability } from "../services/availabilityService";
import { formatDate } from "../utils/format";

vi.mock("../services/vendorService", () => ({ getVendorById: vi.fn() }));
vi.mock("../services/availabilityService", () => ({ getVendorAvailability: vi.fn() }));

const vendor = {
  _id: "vendor-1", businessName: "Celebration Studio", serviceCategory: "Decoration",
  location: "Delhi", pricing: 50000, verificationStatus: "approved", description: "Thoughtful celebration design.",
  servicesOffered: ["Floral design"], coverImage: "https://example.com/cover.jpg",
  portfolioImages: ["https://example.com/portfolio.jpg"]
};
const renderProfile = () => render(<MemoryRouter initialEntries={["/vendors/vendor-1"]}><Routes><Route path="/vendors/:id" element={<VendorDetailsPage />} /></Routes></MemoryRouter>);

describe("vendor profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVendorById.mockResolvedValue(vendor);
    getVendorAvailability.mockResolvedValue({ availability: { unavailableDates: ["2099-12-20"], bookedDates: ["2099-12-20", "2099-12-21"] } });
  });

  it("preserves real availability and booking destinations", async () => {
    renderProfile();
    await screen.findByRole("heading", { name: "Celebration Studio" });
    expect(getVendorById).toHaveBeenCalledWith("vendor-1");
    expect(getVendorAvailability).toHaveBeenCalledWith("vendor-1");
    expect(screen.getByText("Approved listing")).toBeInTheDocument();
    expect(screen.queryByText(/Verified vendor/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(formatDate("2099-12-20"))).toHaveLength(1);
    expect(screen.getByText(formatDate("2099-12-21"))).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "Request booking" })) expect(link).toHaveAttribute("href", "/booking/vendor-1");
  });

  it("supports keyboard gallery navigation and returns focus on close", async () => {
    renderProfile();
    const trigger = await screen.findByRole("button", { name: "Preview business photo 1" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Celebration Studio" });
    expect(within(dialog).getByRole("button", { name: "Close photo preview" })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(within(dialog).getByRole("img", { name: "Celebration Studio portfolio, photo 2 enlarged" })).toHaveAttribute("src", "https://example.com/portfolio.jpg");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps the profile usable when availability fails", async () => {
    getVendorAvailability.mockRejectedValue(new Error("Unavailable"));
    renderProfile();
    await screen.findByRole("heading", { name: "Celebration Studio" });
    expect(screen.getByRole("status")).toHaveTextContent("Availability could not be loaded.");
    expect(screen.getAllByRole("link", { name: "Request booking" })).toHaveLength(2);
  });

  it("shows coverage and the manual approval meaning while keeping business contacts private", async () => {
    getVendorById.mockResolvedValueOnce({ ...vendor, city: "New Delhi", serviceAreas: ["Noida", "Gurugram"], contactDetails: { email: "private-business@example.com", phone: "8888888888" } });
    renderProfile();
    await screen.findByRole("heading", { name: "Celebration Studio" });
    expect(screen.getByText("Based in New Delhi")).toBeInTheDocument();
    const coverage = screen.getByRole("list", { name: "Service coverage areas" });
    expect(within(coverage).getByText("Noida")).toBeInTheDocument();
    expect(within(coverage).getByText("Gurugram")).toBeInTheDocument();
    expect(screen.getByText(/manually reviewed for the marketplace/)).toBeInTheDocument();
    expect(screen.queryByText("private-business@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("8888888888")).not.toBeInTheDocument();
  });
});
