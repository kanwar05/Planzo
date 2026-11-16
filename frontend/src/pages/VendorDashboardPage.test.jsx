import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VendorDashboardPage from "./VendorDashboardPage";
import { getVendorRequests, updateBookingStatus } from "../services/bookingService";
import { getMyVendorProfile } from "../services/vendorService";
const { account } = vi.hoisted(() => ({ account: { user: { role: "vendor", emailVerified: true } } }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => account }));
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
    account.user.emailVerified = true;
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
    if (status === "rejected") fireEvent.click(screen.getByRole("button", { name: "Confirm rejection" }));
    await waitFor(() => expect(updateBookingStatus).toHaveBeenCalledWith("booking-1", status));
    expect(await screen.findByText(status)).toBeInTheDocument();
  });
  it("allows completion of an accepted event after its UTC day has elapsed", async () => {
    getVendorRequests.mockResolvedValueOnce([{
      ...request,
      eventDate: "2020-02-01",
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

  it("shows server completion and a correction path for rejected profiles without changing booking history", async () => {
    getMyVendorProfile.mockResolvedValueOnce({ businessName: "Event Studio", verificationStatus: "rejected",
      verificationRejectionReason: "Clarify your location.", profileCompletion: { percent: 80, readyForReview: false, missingFields: ["location"] } });
    getVendorRequests.mockResolvedValueOnce([{ ...request, eventDate: "2020-02-01", status: "accepted" }]);
    render(<MemoryRouter><VendorDashboardPage /></MemoryRouter>);
    expect(await screen.findByText("80% complete")).toBeInTheDocument();
    expect(screen.getByText(/Clarify your location/)).toBeInTheDocument();
    expect(screen.getByText(/Complete these details for review: Service location/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Correct and resubmit" })).toHaveAttribute("href", "/vendor/profile-setup");
    expect(screen.getByRole("button", { name: "Mark completed" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View public listing" })).not.toBeInTheDocument();
  });
  it("keeps history visible but disables marketplace writes for an unverified vendor", async () => {
    account.user.emailVerified = false;
    getVendorRequests.mockResolvedValueOnce([request]);
    render(<MemoryRouter><VendorDashboardPage /></MemoryRouter>);
    expect(await screen.findByText("Customer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
    expect(updateBookingStatus).not.toHaveBeenCalled();
  });
});
