import { createHmac, timingSafeEqual } from "node:crypto";
import ApiError from "../utils/ApiError.js";

const API_ORIGIN = "https://api.razorpay.com/v1";
const identifier = /^[A-Za-z0-9_-]{1,80}$/;

export class PaymentProviderError extends Error {
  constructor() {
    super("The payment provider could not complete the request.");
    this.name = "PaymentProviderError";
    this.code = "PAYMENT_PROVIDER_UNAVAILABLE";
    this.statusCode = 502;
  }
}

export function razorpayConfiguration(env = process.env) {
  const values = [env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET, env.RAZORPAY_WEBHOOK_SECRET];
  if (!values.some(Boolean)) return null;
  if (!values.every((value) => typeof value === "string" && value.trim()))
    throw new ApiError(503, "Online payments are not configured.");
  if (!env.RAZORPAY_KEY_ID.startsWith("rzp_test_") || (env.RAZORPAY_MODE && env.RAZORPAY_MODE !== "test"))
    throw new ApiError(503, "Razorpay live mode is not enabled for this rollout.");
  return {
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
  };
}

function safeIdentifier(value) {
  if (typeof value !== "string" || !identifier.test(value))
    throw new ApiError(400, "Invalid payment provider reference.");
  return value;
}

async function request(path, method, body, config = razorpayConfiguration()) {
  if (!config) throw new ApiError(503, "Online payments are not configured.");
  let response;
  try {
    response = await fetch(`${API_ORIGIN}${path}`, {
      method,
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new PaymentProviderError();
  }
  if (!response.ok) throw new PaymentProviderError();
  try {
    return await response.json();
  } catch {
    throw new PaymentProviderError();
  }
}

export function verifyCheckoutSignature(orderId, paymentId, signature, secret) {
  if (![orderId, paymentId].every((value) => typeof value === "string" && identifier.test(value)) ||
      typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature) ||
      typeof secret !== "string" || !secret)
    return false;
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function verifyWebhookSignature(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || typeof signature !== "string" ||
      !/^[a-f0-9]{64}$/i.test(signature) || typeof secret !== "string" || !secret)
    return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export const razorpayProvider = Object.freeze({
  async createOrder({ amountPaise, receipt, notes }) {
    const order = await request("/orders", "POST", {
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes,
    });
    if (!order?.id || order.amount !== amountPaise || order.currency !== "INR" ||
        !["created", "attempted"].includes(order.status))
      throw new PaymentProviderError();
    return { id: safeIdentifier(order.id), amount: order.amount, currency: order.currency };
  },
  async fetchPayment(paymentId) {
    const payment = await request(`/payments/${safeIdentifier(paymentId)}`, "GET");
    if (!payment?.id || !payment.order_id || !Number.isSafeInteger(payment.amount) ||
        payment.amount < 1 || payment.amount > 100_000_000_000 ||
        payment.currency !== "INR" || !["created", "authorized", "captured", "failed"].includes(payment.status))
      throw new PaymentProviderError();
    return {
      id: safeIdentifier(payment.id),
      orderId: safeIdentifier(payment.order_id),
      amountPaise: payment.amount,
      currency: payment.currency,
      status: payment.status,
      errorCode: typeof payment.error_code === "string" ? payment.error_code.slice(0, 80) : "",
    };
  },
  async fetchOrderPayments(orderId) {
    const result = await request(`/orders/${safeIdentifier(orderId)}/payments`, "GET");
    if (!Array.isArray(result?.items)) throw new PaymentProviderError();
    return result.items.map(payment => {
      if (!payment?.id || payment.order_id !== orderId || !Number.isSafeInteger(payment.amount) ||
          payment.amount < 1 || payment.amount > 100_000_000_000 ||
          payment.currency !== "INR" || !["created", "authorized", "captured", "failed"].includes(payment.status))
        throw new PaymentProviderError();
      return {
        id: safeIdentifier(payment.id),
        orderId,
        amountPaise: payment.amount,
        currency: payment.currency,
        status: payment.status,
        errorCode: typeof payment.error_code === "string" ? payment.error_code.slice(0, 80) : "",
      };
    });
  },
  async createRefund({ paymentId, amountPaise, refundId }) {
    const refund = await request(`/payments/${safeIdentifier(paymentId)}/refund`, "POST", {
      amount: amountPaise,
      notes: { planzo_refund_id: String(refundId) },
    });
    if (!refund?.id || refund.amount !== amountPaise ||
        !["created", "pending", "processed", "failed"].includes(refund.status))
      throw new PaymentProviderError();
    return { id: safeIdentifier(refund.id), status: refund.status };
  },
});

export function setRazorpayProviderForTests(provider) {
  if (process.env.NODE_ENV !== "test")
    throw new Error("Payment provider injection is only available in tests.");
  if (provider !== undefined && (!provider ||
      typeof provider.createOrder !== "function" ||
      typeof provider.fetchPayment !== "function" ||
      typeof provider.fetchOrderPayments !== "function" ||
      typeof provider.createRefund !== "function"))
    throw new Error("Payment test provider must implement order, payment lookup and refund methods.");
  testProvider = provider;
}

let testProvider;
export function getRazorpayProvider() {
  return testProvider || razorpayProvider;
}
