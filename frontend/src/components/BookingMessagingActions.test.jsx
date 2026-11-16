import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import BookingCard from "./BookingCard";
const booking = { _id: "b".repeat(24), status: "pending", eventType: "Wedding", eventDate: "2099-04-01", eventLocation: "Garden venue", vendorId: { businessName: "Event Studio" } };
describe("booking message actions", () => {
  it("links customer bookings to their private conversation and exposes unread indicators", () => {
    render(<MemoryRouter><BookingCard booking={booking} unreadCount={3} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /Message Vendor/ })).toHaveAttribute("href", `/bookings/${booking._id}/messages`);
    expect(screen.getByLabelText("3 unread messages")).toBeInTheDocument();
  });
  it.each(["pending", "accepted", "completed", "rejected", "cancelled"])("keeps vendor %s message history accessible while writes are disabled", status => {
    render(<MemoryRouter><BookingCard booking={{ ...booking, status }} role="vendor" verified={false} busy /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Message Customer" })).toHaveAttribute("href", `/bookings/${booking._id}/messages`);
  });
});
