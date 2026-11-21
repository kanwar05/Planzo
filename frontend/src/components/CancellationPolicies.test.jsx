import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BookingReasonDialog from "./BookingReasonDialog";
import BookingQuotations from "./BookingQuotations";
import BookingCancellationInfo from "./BookingCancellationInfo";
import { getBookingCancellationPolicy } from "../services/cancellationPolicyService";
import { getQuotations, acceptQuotation } from "../services/quotationService";
vi.mock("../services/cancellationPolicyService", () => ({ getBookingCancellationPolicy: vi.fn() }));
vi.mock("../services/quotationService", () => ({ getQuotations: vi.fn(), acceptQuotation: vi.fn(), rejectQuotation: vi.fn(), sendQuotation: vi.fn() }));
const id = "b".repeat(24);
const booking = { _id: id, eventDate: "2099-04-01", eventType: "Wedding", status: "accepted", eventLocation: "Garden", vendorId: { businessName: "Event Studio" } };
const policy = { key: "standard", version: 3, title: "Agreed cancellation policy", description: "Review these conditions.", customerPendingCutoffHours: null, customerAcceptedCutoffHours: 24, vendorCutoffHours: 0, consequences: "Contact support for coordination. No refund is promised." };
const eligible = { policy, source: "accepted", eligibility: { customerCanCancel: true, vendorCanCancel: true, adminCanCancel: true, adminOverrideRequired: false } };
describe("cancellation policy controls", () => {
  beforeEach(() => { vi.resetAllMocks(); getBookingCancellationPolicy.mockResolvedValue(eligible); });
  it("requires the vendor's reason before confirming cancellation", async () => {
    const confirm = vi.fn();
    render(<BookingReasonDialog booking={booking} role="vendor" status="cancelled" onClose={vi.fn()} onConfirm={confirm} />);
    await screen.findByText(/Agreed cancellation policy/);
    expect(screen.getByRole("button", { name: "Confirm cancellation" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Cancellation reason (required)"), { target: { value: "  Unable to staff the event  " } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("Unable to staff the event"));
  });
  it("blocks customer cancellation beyond the server cutoff", async () => {
    getBookingCancellationPolicy.mockResolvedValue({ ...eligible, eligibility: { customerCanCancel: false, customerReason: "The agreed cutoff has passed." } });
    render(<BookingReasonDialog booking={booking} status="cancelled" onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("agreed cutoff has passed");
    expect(screen.getByRole("button", { name: "Confirm cancellation" })).toBeDisabled();
  });
  it("requires an explicit administrator override and reason after a cutoff", async () => {
    const confirm = vi.fn();
    getBookingCancellationPolicy.mockResolvedValue({ ...eligible, eligibility: { adminCanCancel: true, adminOverrideRequired: true } });
    render(<BookingReasonDialog booking={booking} role="admin" status="cancelled" onClose={vi.fn()} onConfirm={confirm} />);
    await screen.findByText(/Agreed cancellation policy/);
    fireEvent.change(screen.getByLabelText("Cancellation reason (optional)"), { target: { value: "Documented safety issue" } });
    expect(screen.getByRole("button", { name: "Confirm cancellation" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Override the policy cutoff/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("Documented safety issue", { overridePolicy: true }));
  });
  it("keeps failed eligibility checks blocked and supports a safe reload", async () => {
    getBookingCancellationPolicy.mockRejectedValueOnce(new Error("Network unavailable"));
    render(<BookingReasonDialog booking={booking} status="cancelled" onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Network unavailable");
    expect(screen.getByRole("button", { name: "Confirm cancellation" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry eligibility check" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm cancellation" })).toBeEnabled());
  });
  it("shows grandfathered cancellation information without inventing accepted policy consent", async () => {
    getBookingCancellationPolicy.mockResolvedValue({ ...eligible, policy: { ...policy, key: "legacy", version: 0 }, source: "legacy" });
    render(<MemoryRouter><BookingCancellationInfo booking={booking} /></MemoryRouter>);
    expect(getBookingCancellationPolicy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "View cancellation policy" }));
    expect(await screen.findByText("Grandfathered cancellation terms")).toBeInTheDocument();
  });
  it("binds explicit quotation acceptance to the exact displayed policy version", async () => {
    getQuotations.mockResolvedValue([{ _id: "quote-1", revision: 2, expiresAt: "2099-03-01T00:00:00Z", serviceDate: "2099-04-01", cancellationPolicy: policy, items: [], totalAmount: 10000 }]);
    acceptQuotation.mockResolvedValue({ ...booking, quotationStatus: "accepted" });
    render(<BookingQuotations booking={{ ...booking, status: "pending", quotationRevision: 2, quotationStatus: "offered" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Review quotations" }));
    const accept = await screen.findByRole("button", { name: "Accept quotation and reserve date" });
    expect(accept).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /acknowledge cancellation policy version 3/ }));
    fireEvent.click(accept);
    await waitFor(() => expect(acceptQuotation).toHaveBeenCalledWith(id, 2, { key: "standard", version: 3 }));
  });
});
