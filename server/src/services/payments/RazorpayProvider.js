import crypto from "node:crypto";
import Razorpay from "razorpay";
import PaymentProvider from "./PaymentProvider.js";
import ApiError from "../../utils/ApiError.js";

const safeError = (error, fallback) => new ApiError(error?.statusCode >= 400 && error.statusCode < 500 ? 400 : 502, fallback);
export default class RazorpayProvider extends PaymentProvider {
  constructor({ keyId = process.env.RAZORPAY_KEY_ID, keySecret = process.env.RAZORPAY_KEY_SECRET, webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET } = {}) {
    super(); this.keyId = keyId; this.keySecret = keySecret; this.webhookSecret = webhookSecret;
    this.client = keyId && keySecret ? new Razorpay({ key_id: keyId, key_secret: keySecret }) : null;
  }
  requireClient() { if (!this.client) throw new ApiError(503, "Payment gateway is not configured."); }
  async createOrder({ amount, currency, receipt, notes }) { this.requireClient(); try { return await this.client.orders.create({ amount, currency, receipt, notes }); } catch (e) { throw safeError(e, "Unable to create payment order."); } }
  verifyPayment({ orderId, paymentId, signature }) { if (!this.keySecret) throw new ApiError(503, "Payment gateway is not configured."); const expected = crypto.createHmac("sha256", this.keySecret).update(`${orderId}|${paymentId}`).digest("hex"); return signature?.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)); }
  verifyWebhook(rawBody, signature) { if (!this.webhookSecret || !signature) return false; const expected = crypto.createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex"); return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)); }
  async fetchPayment(id) { this.requireClient(); try { return await this.client.payments.fetch(id); } catch (e) { throw safeError(e, "Unable to confirm payment with provider."); } }
  async refundPayment(id, { amount, notes }) { this.requireClient(); try { return await this.client.payments.refund(id, { amount, notes }); } catch (e) { throw safeError(e, "Unable to initiate refund."); } }
  async createPayout(data) { this.requireClient(); try { return await this.client.payouts.create(data); } catch (e) { throw safeError(e, "Unable to initiate payout."); } }
  async fetchPayoutStatus(id) { this.requireClient(); return this.client.payouts.fetch(id); }
}
