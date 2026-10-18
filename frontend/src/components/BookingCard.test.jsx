import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BookingCard from "./BookingCard";
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
});
