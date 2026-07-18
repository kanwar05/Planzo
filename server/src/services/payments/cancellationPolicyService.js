import { getPaymentConfig } from "../../config/payment.js";
import { eventStart } from "./paymentEligibilityService.js";

export const calculateCancellation = (booking, now = new Date(), cancelledByRole = "customer") => {
  const config = getPaymentConfig();
  const paidAmount = Math.max(0, booking.totalPaidAmount || 0);
  const hoursBeforeEvent = (eventStart(booking) - now) / 3600000;
  let refundPercentage = 0;
  let policyOutcome = "no_refund";

  if (["vendor", "admin"].includes(cancelledByRole)) {
    refundPercentage = 100;
    policyOutcome = "full_refund";
  } else if (hoursBeforeEvent >= config.cancellationFreeWindowHours) {
    refundPercentage = 100;
    policyOutcome = "full_refund";
  } else if (hoursBeforeEvent >= config.cancellationPartialWindowHours) {
    refundPercentage = config.cancellationPartialRefundPercentage;
    policyOutcome = refundPercentage === 100 ? "full_refund" : refundPercentage ? "partial_refund" : "no_refund";
  }

  const policyRefund = Math.floor(paidAmount * refundPercentage / 100);
  const lateCancellationFee = cancelledByRole === "customer" && refundPercentage < 100
    ? Math.min(policyRefund, Math.floor((booking.totalAmount || 0) * config.cancellationFeePercentage / 100))
    : 0;
  const refundAmount = Math.max(0, policyRefund - lateCancellationFee);
  if (!refundAmount) policyOutcome = "no_refund";

  return { paidAmount, refundPercentage: paidAmount ? Math.floor(refundAmount * 100 / paidAmount) : 0, refundAmount, lateCancellationFee, policyOutcome, hoursBeforeEvent, policySnapshot: config };
};
