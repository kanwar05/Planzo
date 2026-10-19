import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminBookingsPage from "./AdminBookingsPage";
import { getAdminBookings } from "../services/adminService";
import { updateBookingStatus } from "../services/bookingService";

vi.mock("../services/adminService", () => ({ getAdminBookings: vi.fn() }));
vi.mock("../services/bookingService", () => ({ updateBookingStatus: vi.fn() }));

const booking = {
  _id: "booking-1", status: "accepted", eventType: "Wedding", eventDate: "2030-02-01",
  eventLocation: "Delhi", vendorId: { businessName: "Event Studio" }, customerId: { name: "Customer" }
};

describe("admin booking controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAdminBookings.mockResolvedValue({ bookings: [booking], pagination: { page: 1, pages: 1 } });
    updateBookingStatus.mockResolvedValue({ ...booking, status: "cancelled" });
  });

  it("requires confirmation and lets the admin keep a booking", async () => {
    render(<MemoryRouter><AdminBookingsPage /></MemoryRouter>);
    const trigger = await screen.findByRole("button", { name: "Cancel booking" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Cancel this booking?" });
    expect(within(dialog).getByText("Event Studio")).toBeInTheDocument();
    expect(updateBookingStatus).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep booking" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm cancellation" }));
    await waitFor(() => expect(updateBookingStatus).toHaveBeenCalledWith("booking-1", "cancelled"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps a failed cancellation recoverable inside the dialog", async () => {
    updateBookingStatus.mockRejectedValue(new Error("Unable to cancel booking."));
    render(<MemoryRouter><AdminBookingsPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel booking" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm cancellation" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Unable to cancel booking.");
    expect(within(dialog).getByRole("button", { name: "Confirm cancellation" })).toBeEnabled();
    expect(screen.queryByText("Booking cancelled.")).not.toBeInTheDocument();
  });

  it("retains the booking status filter API contract", async () => {
    render(<MemoryRouter><AdminBookingsPage /></MemoryRouter>);
    await screen.findByText("Event Studio");
    fireEvent.change(screen.getByLabelText("Booking status"), { target: { value: "completed" } });
    await waitFor(() => expect(getAdminBookings).toHaveBeenLastCalledWith({ status: "completed", page: 1, limit: 12 }));
  });

  it("keeps the newest booking filter results when an older request finishes later", async () => {
    let finishFirst;
    const firstRequest = new Promise(resolve => { finishFirst = resolve; });
    getAdminBookings.mockResolvedValueOnce(firstRequest).mockResolvedValueOnce({
      bookings: [{ ...booking, status: "completed", vendorId: { businessName: "Completed Studio" } }], pagination: { page: 1, pages: 1 }
    });
    render(<MemoryRouter><AdminBookingsPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Booking status"), { target: { value: "completed" } });
    expect(await screen.findByText("Completed Studio")).toBeInTheDocument();
    await act(async () => {
      finishFirst({ bookings: [booking], pagination: { page: 1, pages: 3 } });
      await firstRequest;
    });
    expect(screen.getByLabelText("Booking status")).toHaveValue("completed");
    expect(screen.getByText("Completed Studio")).toBeInTheDocument();
    expect(screen.queryByText("Event Studio")).not.toBeInTheDocument();
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
  });
});
