import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BookingRequestPage from "./BookingRequestPage";
import { getVendorPackages } from "../services/packageService";
import { createBooking } from "../services/bookingService";
vi.mock("../services/packageService", () => ({ getVendorPackages: vi.fn() }));
vi.mock("../services/vendorService", () => ({ getVendorById: vi.fn().mockResolvedValue({ _id: "vendor-1", businessName: "Event Studio", serviceCategory: "Decoration", location: "Delhi", pricing: 1000 }) }));
vi.mock("../services/availabilityService", () => ({ getVendorAvailability: vi.fn().mockResolvedValue({ availability: { unavailableDates: [], bookedDates: [] } }) }));
vi.mock("../services/bookingService", () => ({ createBooking: vi.fn() }));
const id = "1234567890abcdef12345678";
const item = { _id: id, title: "Garden styling", active: true, priceAmount: 10001, priceType: "starting", pricingUnit: "event", includedServices: ["Flowers"] };
const renderPage = () => render(<MemoryRouter initialEntries={[{ pathname: "/booking/vendor-1", state: { packageId: id } }]}><Routes><Route path="/booking/:vendorId" element={<BookingRequestPage />} /></Routes></MemoryRouter>);
describe("package selection during booking", () => {
  beforeEach(() => { vi.clearAllMocks(); getVendorPackages.mockResolvedValue([item]); createBooking.mockResolvedValue({ _id: "booking-1" }); });
  it("reviews the selected active package and includes its id in the durable request", async () => {
    renderPage();
    expect(await screen.findByLabelText("Service package")).toHaveValue(id);
    await screen.findByText(/From ₹100.01/);
    fireEvent.change(screen.getByLabelText("Event date"), { target: { value: "2099-04-01" } });
    fireEvent.change(screen.getByLabelText("Event type"), { target: { value: "Wedding" } });
    fireEvent.change(screen.getByLabelText("Event location"), { target: { value: "Delhi hall" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Event description"), { target: { value: "A garden wedding reception" } });
    fireEvent.click(screen.getByRole("button", { name: "Review request" }));
    expect(screen.getByRole("region", { name: "Selected package" })).toHaveTextContent("Garden styling");
    fireEvent.click(screen.getByRole("button", { name: "Send booking request" }));
    await waitFor(() => expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({ packageId: id }), expect.objectContaining({ idempotencyKey: expect.any(String) })));
  });
  it("blocks inactive or removed selections while allowing the custom request fallback", async () => {
    getVendorPackages.mockResolvedValue([{ ...item, active: false }]);
    renderPage();
    await screen.findByText(/This package is inactive or unavailable/);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Service package"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    expect(createBooking).not.toHaveBeenCalled();
  });
});
