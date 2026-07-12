import RazorpayProvider from "./RazorpayProvider.js";
import StripeProvider from "./StripeProvider.js";
export const getPaymentProvider = (name = process.env.PAYMENT_PROVIDER || "razorpay") => name === "stripe" ? new StripeProvider() : new RazorpayProvider();
