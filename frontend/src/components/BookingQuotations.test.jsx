import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BookingQuotations from "./BookingQuotations";
import { acceptQuotation, getQuotations, rejectQuotation, sendQuotation } from "../services/quotationService";
vi.mock("../services/quotationService", () => ({ acceptQuotation: vi.fn(), getQuotations: vi.fn(), rejectQuotation: vi.fn(), sendQuotation: vi.fn() }));
const booking = { _id: "booking-1", status: "pending", eventDate: "2099-04-01T00:00:00Z", eventDateOnly: "2099-04-01", description: "A garden wedding", quotationRevision: 2, quotationStatus: "offered" };
const quote = { _id: "quote-2", revision: 2, serviceDate: "2099-04-01", serviceDescription: "Final garden styling", items: [{ description: "Flowers", quantity: 2, unitPriceAmount: 10001 }], additionalCharges: [{ description: "Travel", amount: 5000 }], discountAmount: 1000, totalAmount: 24002, currency: "INR", deliverables: ["Seasonal flowers"], exclusions: ["Venue hire"], terms: "Setup before guests arrive.", expiresAt: "2099-03-01T00:00:00Z" };
describe("booking quotations", () => {
  beforeEach(() => { vi.resetAllMocks(); getQuotations.mockResolvedValue([quote, { ...quote, _id: "quote-1", revision: 1 }]); });
  it("lets the verified customer review and explicitly accept the latest exact agreement", async () => {
    const agreement = { ...quote, quotationId: quote._id, acceptedAt: new Date().toISOString() };
    const onBookingChange = vi.fn();
    acceptQuotation.mockResolvedValue({ ...booking, status: "accepted", quotationStatus: "accepted", acceptedAgreement: agreement });
    render(<BookingQuotations booking={booking} onBookingChange={onBookingChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Review quotations" }));
    const latest = await screen.findByRole("region", { name: "Quotation revision 2" });
    expect(within(latest).getByText("Quotation total").nextElementSibling).toHaveTextContent("₹240.02 INR");
    expect(within(latest).getByText("Setup before guests arrive.")).toBeInTheDocument();
    expect(screen.getByText("Previous quotation revisions (1)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept quotation and reserve date" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /acknowledge cancellation policy/ }));
    fireEvent.click(screen.getByRole("button", { name: "Accept quotation and reserve date" }));
    await waitFor(() => expect(acceptQuotation).toHaveBeenCalledWith("booking-1", 2, { key: "legacy", version: 0 }));
    expect(await screen.findByRole("region", { name: "Accepted agreement" })).toHaveTextContent("Version 2");
    expect(onBookingChange).toHaveBeenCalledWith(expect.objectContaining({ status: "accepted", acceptedAgreement: agreement }));
    expect(screen.queryByRole("button", { name: "Accept quotation and reserve date" })).not.toBeInTheDocument();
  });
  it("rejects the latest offer without cancelling the pending booking", async () => {
    rejectQuotation.mockResolvedValue({ ...booking, quotationStatus: "rejected" });
    render(<BookingQuotations booking={booking} />);
    fireEvent.click(screen.getByRole("button", { name: "Review quotations" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reject quotation" }));
    await waitFor(() => expect(rejectQuotation).toHaveBeenCalledWith("booking-1", 2));
    expect(await screen.findByText(/booking remains pending/)).toBeInTheDocument();
  });
  it("disables acceptance for expired quotations and unverified customers", async () => {
    getQuotations.mockResolvedValue([{ ...quote, expiresAt: "2000-01-01T00:00:00Z" }]);
    const { rerender } = render(<BookingQuotations booking={booking} />);
    fireEvent.click(screen.getByRole("button", { name: "Review quotations" }));
    expect(await screen.findByRole("button", { name: "Accept quotation and reserve date" })).toBeDisabled();
    expect(screen.getByText(/quotation has expired/)).toBeInTheDocument();
    rerender(<BookingQuotations booking={booking} verified={false} />);
    expect(screen.queryByRole("button", { name: "Accept quotation and reserve date" })).not.toBeInTheDocument();
    expect(acceptQuotation).not.toHaveBeenCalled();
  });
  it("shows conflicts as recoverable errors without claiming a reserved date", async () => {
    acceptQuotation.mockRejectedValue({ response: { data: { message: "Vendor is unavailable on this date." } } });
    render(<BookingQuotations booking={booking} />);
    fireEvent.click(screen.getByRole("button", { name: "Review quotations" }));
    await screen.findByRole("button", { name: "Accept quotation and reserve date" });
    fireEvent.click(screen.getByRole("checkbox", { name: /acknowledge cancellation policy/ }));
    fireEvent.click(screen.getByRole("button", { name: "Accept quotation and reserve date" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");
    expect(screen.queryByRole("region", { name: "Accepted agreement" })).not.toBeInTheDocument();
  });
  it("composes a new revision with integer paise and retries the same unresolved version", async () => {
    sendQuotation.mockRejectedValueOnce(new Error("Response lost"))
      .mockResolvedValueOnce({ quotation: { ...quote, revision: 3 }, booking: { ...booking, quotationRevision: 3 } });
    render(<BookingQuotations booking={booking} role="vendor" />);
    fireEvent.click(screen.getByRole("button", { name: "Manage quotation" }));
    fireEvent.click(await screen.findByRole("button", { name: "Create quotation revision" }));
    fireEvent.change(screen.getByLabelText("Unit INR 1"), { target: { value: "100.01" } });
    const expires = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 16);
    fireEvent.change(screen.getByLabelText("Expiry (your local time)"), { target: { value: expires } });
    fireEvent.click(screen.getByRole("button", { name: "Send quotation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Response lost");
    const original = sendQuotation.mock.calls[0];
    expect(original[1]).toEqual(expect.objectContaining({ expectedRevision: 2, items: [{ description: "Flowers", quantity: 2, unitPriceAmount: 10001 }], serviceDate: "2099-04-01", discountAmount: 1000 }));
    expect(original[1].totalAmount).toBeUndefined();
    expect(screen.getByLabelText("Unit INR 1")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Hide quotation history" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Send quotation" }));
    await waitFor(() => expect(sendQuotation).toHaveBeenCalledTimes(2));
    expect(sendQuotation.mock.calls[1]).toEqual(original);
    expect(await screen.findByText(/Quotation sent/)).toBeInTheDocument();
  });
  it("sends only one acceptance while the request is pending", async () => {
    let finish;
    acceptQuotation.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<BookingQuotations booking={booking} />);
    fireEvent.click(screen.getByRole("button", { name: "Review quotations" }));
    const button = await screen.findByRole("button", { name: "Accept quotation and reserve date" });
    fireEvent.click(screen.getByRole("checkbox", { name: /acknowledge cancellation policy/ }));
    fireEvent.click(button); fireEvent.click(button);
    expect(acceptQuotation).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ ...booking, status: "accepted", acceptedAgreement: { ...quote, acceptedAt: new Date().toISOString() } }); });
  });
});
