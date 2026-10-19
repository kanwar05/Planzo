import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
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
const completeDetails = async () => {
  fireEvent.change(await screen.findByLabelText("Event date"), { target: { value: "2027-02-01" } });
  fireEvent.change(screen.getByLabelText("Event type"), { target: { value: "Wedding" } });
  fireEvent.change(screen.getByLabelText("Event location"), { target: { value: "Venue, Delhi" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.change(screen.getByLabelText("Event description"), { target: { value: "Decorate the wedding venue." } });
  fireEvent.change(screen.getByLabelText("Customer notes (optional)"), { target: { value: "Use seasonal flowers." } });
  fireEvent.click(screen.getByRole("button", { name: "Review request" }));
};
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
    await completeDetails();
    expect(createBooking).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "One last look." })).toHaveFocus();
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
      name: "Continue"
    })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("This date is unavailable or already booked.");
    expect(createBooking).not.toHaveBeenCalled();
  });
  it("retains the brief when returning from review and keeps failed requests recoverable", async () => {
    createBooking.mockRejectedValueOnce({ response: { data: { message: "Please try again shortly." } } });
    renderPage();
    await completeDetails();
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    expect(screen.getByLabelText("Event description")).toHaveValue("Decorate the wedding venue.");
    expect(screen.getByLabelText("Customer notes (optional)")).toHaveValue("Use seasonal flowers.");
    fireEvent.click(screen.getByRole("button", { name: "Review request" }));
    fireEvent.click(screen.getByRole("button", { name: "Send booking request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please try again shortly.");
    expect(screen.getByRole("alert")).toHaveFocus();
    expect(screen.queryByText("Request sent!")).not.toBeInTheDocument();
    expect(screen.getByText("Decorate the wedding venue.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send booking request" })).toBeEnabled();
  });
  it("sends only one request while submission is pending", async () => {
    let finish;
    createBooking.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    renderPage();
    await completeDetails();
    const button = screen.getByRole("button", { name: "Send booking request" });
    const form = button.closest("form");
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(createBooking).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit details" })).toBeDisabled();
    await act(async () => { finish({ _id: "booking-1" }); });
    expect(await screen.findByText("Request sent!")).toBeInTheDocument();
  });
  it("keeps whitespace-only event details on the first step", async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText("Event date"), { target: { value: "2027-02-01" } });
    fireEvent.change(screen.getByLabelText("Event type"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("Event location"), { target: { value: "Venue, Delhi" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("add your event type and location");
    expect(screen.getByLabelText("Event type")).toHaveValue("   ");
    expect(screen.queryByLabelText("Event description")).not.toBeInTheDocument();
    expect(createBooking).not.toHaveBeenCalled();
  });
  it("requires a meaningful description before review", async () => {
    renderPage();
    await completeDetails();
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    fireEvent.change(screen.getByLabelText("Event description"), { target: { value: "          " } });
    fireEvent.click(screen.getByRole("button", { name: "Review request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Add at least 10 characters");
    expect(screen.getByLabelText("Event description")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send booking request" })).not.toBeInTheDocument();
    expect(createBooking).not.toHaveBeenCalled();
  });
  it("does not show an old request's success after switching to another vendor", async () => {
    let finish;
    createBooking.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    getVendorById.mockImplementation(async id => ({
      _id: id, businessName: id === "vendor-1" ? "Event Studio" : "Another Studio",
      serviceCategory: "Decoration", pricing: 10000, location: "Delhi"
    }));
    render(<MemoryRouter initialEntries={["/booking/vendor-1"]}>
      <Link to="/booking/vendor-2">Choose another vendor</Link>
      <Routes><Route path="/booking/:vendorId" element={<BookingRequestPage />} /></Routes>
    </MemoryRouter>);
    await completeDetails();
    fireEvent.click(screen.getByRole("button", { name: "Send booking request" }));
    fireEvent.click(screen.getByRole("link", { name: "Choose another vendor" }));
    await screen.findByRole("heading", { name: "Another Studio" });
    expect(screen.getByLabelText("Event date")).toHaveValue("");
    await act(async () => { finish({ _id: "booking-1" }); });
    expect(screen.queryByText("Request sent!")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tell us about your event." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });
});
