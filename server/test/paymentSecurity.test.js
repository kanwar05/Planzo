import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import ApiError from "../src/utils/ApiError.js";
import {
  razorpayConfiguration,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from "../src/services/razorpayProvider.js";
import { paymentSettings } from "../src/services/paymentDomainService.js";

test("checkout and webhook signatures bind the exact provider values and use raw bytes", () => {
  const secret = "payment-test-secret-with-sufficient-length";
  const orderId = "order_123456";
  const paymentId = "pay_123456";
  const checkoutSignature = createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`).digest("hex");
  assert.equal(verifyCheckoutSignature(orderId, paymentId, checkoutSignature, secret), true);
  assert.equal(verifyCheckoutSignature(orderId, "pay_changed", checkoutSignature, secret), false);
  assert.equal(verifyCheckoutSignature(orderId, paymentId, "not-a-signature", secret), false);

  const rawBody = Buffer.from('{"event":"payment.captured"}');
  const webhookSignature = createHmac("sha256", secret).update(rawBody).digest("hex");
  assert.equal(verifyWebhookSignature(rawBody, webhookSignature, secret), true);
  assert.equal(verifyWebhookSignature(Buffer.from(`${rawBody.toString()} `), webhookSignature, secret), false);
  assert.equal(verifyWebhookSignature(rawBody.toString(), webhookSignature, secret), false);
});

test("Razorpay configuration is test-only and basis-point settings are bounded integers", () => {
  const config = razorpayConfiguration({
    RAZORPAY_KEY_ID: "rzp_test_fixture",
    RAZORPAY_KEY_SECRET: "test-key-secret",
    RAZORPAY_WEBHOOK_SECRET: "test-webhook-secret",
    RAZORPAY_MODE: "test",
  });
  assert.equal(config.keyId, "rzp_test_fixture");
  assert.equal(config.keySecret, "test-key-secret");
  assert.equal(config.webhookSecret, "test-webhook-secret");
  assert.equal(razorpayConfiguration({}), null);
  assert.throws(() => razorpayConfiguration({
    RAZORPAY_KEY_ID: "rzp_live_fixture",
    RAZORPAY_KEY_SECRET: "secret",
    RAZORPAY_WEBHOOK_SECRET: "secret",
  }), { statusCode: 503 });
  assert.deepEqual(paymentSettings({
    PAYMENT_DEPOSIT_BPS: "3333",
    PLATFORM_COMMISSION_BPS: "125",
  }), { depositBps: 3333, commissionBps: 125 });
  assert.throws(() => paymentSettings({ PAYMENT_DEPOSIT_BPS: "10001" }), ApiError);
  assert.throws(() => paymentSettings({ PLATFORM_COMMISSION_BPS: "1.5" }), ApiError);
});
