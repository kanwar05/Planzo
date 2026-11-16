import { fireEvent, render as renderComponent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import BookingCard from "./BookingCard";
const render = element => renderComponent(element, { wrapper: MemoryRouter });
const booking = {
  _id: "booking-1",
  eventType: "Wedding",
  eventDate: "2027-02-01",
  eventLocation: "Delhi",
  vendorId: {
    businessName: "Event Studio",
    contactDetails: {
      phone: "+91 9876543210",
      email: "events@example.test"
    }
  },
  customerId: {
    name: "Customer"
  }
};
describe("booking contact visibility", () => {
  it.each(["pending", "rejected", "cancelled"])("hides contacts for a %s request even when fields arrive in the response", status => {
    render(<BookingCard booking={{
      ...booking,
      status
    }} onStatus={vi.fn()} />);
    expect(screen.queryByRole("region", {
      name: "Vendor contact details"
    })).not.toBeInTheDocument();
    expect(screen.queryByText("events@example.test")).not.toBeInTheDocument();
  });
  it.each(["accepted", "completed"])("shows intended contact details for an authorized customer's %s booking", status => {
    render(<BookingCard booking={{
      ...booking,
      status
    }} onStatus={vi.fn()} />);
    expect(screen.getByRole("link", {
      name: "events@example.test"
    })).toHaveAttribute("href", "mailto:events@example.test");
    expect(screen.getByRole("link", {
      name: "+91 9876543210"
    })).toHaveAttribute("href", "tel:+919876543210");
  });
  it("hides contacts from vendor request cards", () => {
    render(<BookingCard booking={{
      ...booking,
      status: "accepted"
    }} role="vendor" onStatus={vi.fn()} />);
    expect(screen.queryByText("events@example.test")).not.toBeInTheDocument();
  });
  it.each([["rejected", "rejectionReason"], ["cancelled", "cancellationReason"]])("shows the %s status reason returned by the API", (status, field) => {
    render(<BookingCard booking={{
      ...booking,
      status,
      [field]: "The event cannot proceed."
    }} onStatus={vi.fn()} />);
    expect(screen.getByText("The event cannot proceed.", {
      exact: false
    })).toBeInTheDocument();
  });
  it.each([["customer", "Cancel booking", "Confirm cancellation", "Cancellation reason (optional)", "cancelled"], ["vendor", "Reject", "Confirm rejection", "Rejection reason (optional)", "rejected"]])("collects a reason before a %s changes the booking", async (role, action, confirmation, label, status) => {
    const onStatus = vi.fn().mockResolvedValue(true);
    render(<BookingCard booking={{ ...booking, status: "pending" }} role={role} onStatus={onStatus} />);
    fireEvent.click(screen.getByRole("button", { name: action }));
    expect(onStatus).not.toHaveBeenCalled();
    expect(screen.getByLabelText(label)).toHaveAttribute("maxlength", "1000");
    fireEvent.change(screen.getByLabelText(label), { target: { value: "  The event cannot proceed.  " } });
    fireEvent.click(screen.getByRole("button", { name: confirmation }));
    await waitFor(() => expect(onStatus).toHaveBeenCalledWith("booking-1", status, "The event cannot proceed."));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("does not offer completion for a future event or a malformed date", () => {
    const { rerender } = render(<BookingCard booking={{ ...booking, status: "accepted", eventDate: "2099-02-01" }} role="vendor" onStatus={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Mark completed" })).not.toBeInTheDocument();
    expect(screen.getByText(/full UTC calendar day/)).toBeInTheDocument();
    rerender(<BookingCard booking={{ ...booking, status: "accepted", eventDate: null }} role="vendor" onStatus={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Mark completed" })).not.toBeInTheDocument();
    expect(screen.getByText("Date unavailable")).toBeInTheDocument();
    rerender(<BookingCard booking={{ ...booking, status: "accepted", eventDate: "2000-02-01" }} role="vendor" onStatus={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Mark completed" })).toBeInTheDocument();
  });
  it("renders a stored reason as text without creating attacker-supplied markup", () => {
    const reason = '<img src=x onerror="alert(1)"><script>alert(1)</script>';
    const { container } = render(<BookingCard booking={{ ...booking, status: "rejected", rejectionReason: reason }} onStatus={vi.fn()} />);
    expect(screen.getByText(reason, { exact: false })).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img[onerror]")).toBeNull();
  });
});
