const integer = (name, fallback) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer.`);
  return value;
};

export const getPaymentConfig = () => {
  const config = {
    provider: process.env.PAYMENT_PROVIDER || "razorpay",
    currency: process.env.PAYMENT_CURRENCY || "INR",
    depositPercentage: integer("BOOKING_DEPOSIT_PERCENTAGE", 25),
    eventDayPercentage: integer("EVENT_DAY_PAYMENT_PERCENTAGE", 40),
    finalPercentage: integer("FINAL_PAYMENT_PERCENTAGE", 35),
    eventDayWindowHours: integer("EVENT_DAY_PAYMENT_WINDOW_HOURS", 24),
    cancellationFreeWindowHours: integer("CANCELLATION_FREE_WINDOW_HOURS", 72),
    cancellationFeePercentage: integer("CANCELLATION_FEE_PERCENTAGE", 10),
    cancellationPartialWindowHours: integer("CANCELLATION_PARTIAL_WINDOW_HOURS", 24),
    cancellationPartialRefundPercentage: integer("CANCELLATION_PARTIAL_REFUND_PERCENTAGE", 50),
    platformFeePercentage: integer("PLATFORM_FEE_PERCENTAGE", 10),
    payoutHoldDays: integer("VENDOR_PAYOUT_HOLD_DAYS", 2),
  };
  if (config.depositPercentage + config.eventDayPercentage + config.finalPercentage !== 100) {
    throw new Error("Payment installment percentages must total exactly 100.");
  }
  if (!/^[A-Z]{3}$/.test(config.currency)) throw new Error("PAYMENT_CURRENCY must be a three-letter code.");
  if (config.cancellationPartialWindowHours > config.cancellationFreeWindowHours) throw new Error("CANCELLATION_PARTIAL_WINDOW_HOURS cannot exceed CANCELLATION_FREE_WINDOW_HOURS.");
  if (config.cancellationPartialRefundPercentage > 100 || config.cancellationFeePercentage > 100) throw new Error("Cancellation percentages cannot exceed 100.");
  return config;
};

export const validatePaymentEnvironment = () => {
  const config = getPaymentConfig();
  if (config.provider === "razorpay" && process.env.NODE_ENV === "production") {
    for (const key of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"]) {
      if (!process.env[key]) throw new Error(`${key} is required in production.`);
    }
  }
  return config;
};
