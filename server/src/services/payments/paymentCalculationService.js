import { getPaymentConfig } from "../../config/payment.js";
import ApiError from "../../utils/ApiError.js";

export const rupeesToPaise = (value) => {
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new ApiError(400, "Booking amount must have at most two decimal places.");
  const [whole, fraction = ""] = text.split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise)) throw new ApiError(400, "Booking amount is outside the supported range.");
  return paise;
};

export const calculateInstallments = (totalAmount, config = getPaymentConfig()) => {
  if (!Number.isSafeInteger(totalAmount) || totalAmount <= 0) throw new ApiError(400, "Final booking amount must be greater than zero.");
  const depositAmount = Math.floor(totalAmount * config.depositPercentage / 100);
  const eventDayAmount = Math.floor(totalAmount * config.eventDayPercentage / 100);
  const finalPaymentAmount = totalAmount - depositAmount - eventDayAmount;
  return { totalAmount, depositPercentage: config.depositPercentage, eventDayPercentage: config.eventDayPercentage, finalPercentage: config.finalPercentage, depositAmount, eventDayAmount, finalPaymentAmount };
};

export const initializeBookingPayments = (booking) => {
  if (!booking.totalAmount) Object.assign(booking, calculateInstallments(rupeesToPaise(booking.budget)));
  booking.totalPaidAmount ??= 0; booking.refundAmount ??= 0;
  booking.remainingAmount = Math.max(0, booking.totalAmount - booking.totalPaidAmount + booking.refundAmount);
  return booking;
};

export const amountForInstallment = (booking, type) => ({ booking_deposit: booking.depositAmount, event_day_payment: booking.eventDayAmount, final_payment: booking.finalPaymentAmount })[type];
