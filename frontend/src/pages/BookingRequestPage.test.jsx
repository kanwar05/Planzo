import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BookingRequestPage from "./BookingRequestPage";
import { getVendorById } from "../services/vendorService";
import { getVendorAvailability } from "../services/availabilityService";
import { createBooking } from "../services/bookingService";
vi.mock("../services/vendorService", () => ({
  getVendorById: vi.fn()
}));
vi.mock("../services/availabilityService", () => ({
  getVendorAvailability: vi.fn()
}));
vi.mock("../services/bookingService", () => ({
  createBooking: vi.fn()
}));
const renderPage = () => render(<MemoryRouter initialEntries={["/booking/vendor-1"]}>
    <Routes>
      <Route path="/booking/:vendorId" element={<BookingRequestPage />} />
    </Routes>
  </MemoryRouter>);
describe("booking request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVendorById.mockResolvedValue({
      _id: "vendor-1",
      businessName: "Event Studio",
      serviceCategory: "Decoration",
      pricing: 10000,
      location: "Delhi"
    });
    getVendorAvailability.mockResolvedValue({
      availability: {
        unavailableDates: ["2027-02-02"],
        bookedDates: ["2027-02-03"]
      }
    });
    createBooking.mockResolvedValue({
      _id: "booking-1"
    });
  });
  it("submits the date and event brief without payment or scheduling fields", async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText("Event date"), {
      target: {
        value: "2027-02-01"
      }
    });
    fireEvent.change(screen.getByLabelText("Event type"), {
      target: {
        value: "Wedding"
      }
    });
    fireEvent.change(screen.getByLabelText("Event location"), {
      target: {
        value: "Venue, Delhi"
      }
    });
    fireEvent.change(screen.getByLabelText("Event description"), {
      target: {
        value: "Decorate the wedding venue."
      }
    });
    fireEvent.change(screen.getByLabelText("Customer notes (optional)"), {
      target: {
        value: "Use seasonal flowers."
      }
    });
    fireEvent.click(screen.getByRole("button", {
      name: "Send booking request"
    }));
    await waitFor(() => expect(createBooking).toHaveBeenCalledWith({
      vendorId: "vendor-1",
      eventDate: "2027-02-01",
      eventType: "Wedding",
      eventLocation: "Venue, Delhi",
      description: "Decorate the wedding venue.",
      notes: "Use seasonal flowers."
    }));
    expect(await screen.findByText("Request sent!")).toBeInTheDocument();
  });
  it.each(["2027-02-02", "2027-02-03"])("disables a request for unavailable date %s", async date => {
    renderPage();
    fireEvent.change(await screen.findByLabelText("Event date"), {
      target: {
        value: date
      }
    });
    expect(screen.getByRole("button", {
      name: "Send booking request"
    })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("This date is unavailable or already booked.");
    expect(createBooking).not.toHaveBeenCalled();
  });
});
