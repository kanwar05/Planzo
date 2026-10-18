import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VendorDashboardPage from "./VendorDashboardPage";
import { getVendorRequests, updateBookingStatus } from "../services/bookingService";
import { getMyVendorProfile } from "../services/vendorService";
vi.mock("../services/bookingService", () => ({
  getVendorRequests: vi.fn(),
  updateBookingStatus: vi.fn()
}));
vi.mock("../services/vendorService", () => ({
  getMyVendorProfile: vi.fn()
}));
const request = {
  _id: "booking-1",
  status: "pending",
  eventType: "Wedding",
  eventDate: "2027-02-01",
  eventLocation: "Delhi",
  customerId: {
    name: "Customer"
  }
};
describe("vendor booking management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMyVendorProfile.mockResolvedValue({
      businessName: "Event Studio",
      verificationStatus: "approved"
    });
  });
  it.each([["Accept", "accepted"], ["Reject", "rejected"]])("sends the %s transition for a pending request", async (label, status) => {
    getVendorRequests.mockResolvedValueOnce([request]).mockResolvedValueOnce([{
      ...request,
      status
    }]);
    updateBookingStatus.mockResolvedValue({
      ...request,
      status
    });
    render(<MemoryRouter>
    <VendorDashboardPage />
  </MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", {
      name: label
    }));
    await waitFor(() => expect(updateBookingStatus).toHaveBeenCalledWith("booking-1", status));
    expect(await screen.findByText(status)).toBeInTheDocument();
  });
  it("allows completion only after acceptance", async () => {
    getVendorRequests.mockResolvedValueOnce([{
      ...request,
      status: "accepted"
    }]).mockResolvedValueOnce([{
      ...request,
      status: "completed"
    }]);
    updateBookingStatus.mockResolvedValue({
      ...request,
      status: "completed"
    });
    render(<MemoryRouter>
    <VendorDashboardPage />
  </MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", {
      name: "Mark completed"
    }));
    await waitFor(() => expect(updateBookingStatus).toHaveBeenCalledWith("booking-1", "completed"));
    expect(await screen.findByText("completed")).toBeInTheDocument();
  });
});
