import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BookingPayments from "./BookingPayments";
import {
  createPaymentOrder,
  getBookingPaymentHistory,
  verifyPayment,
} from "../services/paymentService";

vi.mock("../services/paymentService", () => ({
  createPaymentOrder: vi.fn(),
  downloadPaymentDocument: vi.fn(),
  getBookingPaymentHistory: vi.fn(),
  verifyPayment: vi.fn(),
}));

const booking = {
  _id: "booking-1",
  status: "accepted",
  acceptedAgreement: { totalAmount: 10000 },
};

describe("booking payments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBookingPaymentHistory.mockResolvedValue({ payments: [], refunds: [] });
  });
  afterEach(() => { delete window.Razorpay; });

  it("uses the server-created order, verifies checkout response, then reloads webhook-backed history", async () => {
    const opened = vi.fn();
    window.Razorpay = vi.fn(function (options) { this.open = opened; this.options = options; });
    createPaymentOrder.mockResolvedValue({
      payment: { amountPaise: 3000, providerOrderId: "order_test" },
      checkout: { keyId: "rzp_test_fixture", orderId: "order_test", currency: "INR" },
    });
    verifyPayment.mockResolvedValue({
      confirmed: false,
      message: "Payment details were verified. Final confirmation is pending from Razorpay.",
    });
    getBookingPaymentHistory
      .mockResolvedValueOnce({ payments: [], refunds: [] })
      .mockResolvedValue({ payments: [{
        _id: "payment-1", installment: "deposit", status: "authorized",
        amountPaise: 3000, capturedAmountPaise: 0, refundedAmountPaise: 0,
      }], refunds: [] });

    render(<BookingPayments booking={booking} />);
    fireEvent.click(await screen.findByRole("button", { name: "Pay deposit" }));
    await waitFor(() => expect(opened).toHaveBeenCalledOnce());
    const options = window.Razorpay.mock.instances[0].options;
    await options.handler({
      razorpay_order_id: "order_test",
      razorpay_payment_id: "pay_test",
      razorpay_signature: "signature",
    });
    await waitFor(() => expect(verifyPayment).toHaveBeenCalledWith({
      razorpay_order_id: "order_test",
      razorpay_payment_id: "pay_test",
      razorpay_signature: "signature",
    }));
    expect(await screen.findByText(/Final confirmation is pending/)).toBeInTheDocument();
    expect(screen.getByText("deposit · ₹30.00")).toBeInTheDocument();
    expect(screen.getByText("authorized")).toBeInTheDocument();
  });
});
