import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CustomerDashboardPage from "./CustomerDashboardPage";
import { getMyBookings, updateBookingStatus } from "../services/bookingService";
vi.mock("../services/bookingService", () => ({
  getMyBookings: vi.fn(),
  updateBookingStatus: vi.fn()
}));
const pending = {
  _id: "booking-1",
  status: "pending",
  eventType: "Wedding",
  eventDate: "2027-02-01",
  eventLocation: "Delhi",
  vendorId: {
    businessName: "Event Studio"
  }
};
describe("customer bookings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMyBookings.mockResolvedValue([pending]);
  });
  it("cancels an eligible request and updates its status", async () => {
    getMyBookings.mockResolvedValueOnce([pending]).mockResolvedValueOnce([{
      ...pending,
      status: "cancelled"
    }]);
    updateBookingStatus.mockResolvedValue({
      ...pending,
      status: "cancelled"
    });
    render(<MemoryRouter>
    <CustomerDashboardPage />
  </MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", {
      name: "Cancel booking"
    }));
    await waitFor(() => expect(updateBookingStatus).toHaveBeenCalledWith("booking-1", "cancelled"));
    expect(await screen.findByText("cancelled")).toBeInTheDocument();
    expect(screen.queryByRole("button", {
      name: "Cancel booking"
    })).not.toBeInTheDocument();
  });
  it("keeps a failed cancellation visible with an error", async () => {
    updateBookingStatus.mockRejectedValue({
      response: {
        data: {
          message: "This booking has already changed."
        }
      }
    });
    render(<MemoryRouter>
    <CustomerDashboardPage />
  </MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", {
      name: "Cancel booking"
    }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This booking has already changed.");
    expect(screen.getByRole("button", {
      name: "Cancel booking"
    })).toBeEnabled();
  });
});
