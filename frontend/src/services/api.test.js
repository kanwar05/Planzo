import { beforeEach, describe, expect, it, vi } from "vitest";

const { client, post, interceptors } = vi.hoisted(() => ({
  client: vi.fn(), post: vi.fn(), interceptors: { response: { use: vi.fn() } },
}));
vi.mock("axios", () => ({ default: { create: () => Object.assign(client, { post, interceptors }) } }));
import "./api";

const rejectResponse = interceptors.response.use.mock.calls[0][1];
describe("session refresh and mailbox verification", () => {
  beforeEach(() => {
    client.mockReset(); post.mockReset();
    post.mockResolvedValue({ data: { user: {} } });
    client.mockResolvedValue({ data: { success: true } });
  });
  it("does not refresh or replay a rejected verification code", async () => {
    const error = { config: { url: "/auth/email-verification/verify" },
      response: { status: 401, data: { code: "OTP_VERIFICATION_FAILED" } } };
    await expect(rejectResponse(error)).rejects.toBe(error);
    expect(post).not.toHaveBeenCalled();
    expect(client).not.toHaveBeenCalled();
  });
  it("still refreshes an expired access session before verification", async () => {
    const config = { url: "/auth/email-verification/verify", data: { code: "123456" } };
    await expect(rejectResponse({ config, response: { status: 401, data: {} } })).resolves.toEqual({ data: { success: true } });
    expect(post).toHaveBeenCalledWith("/auth/refresh", null, { _retry: true });
    expect(client).toHaveBeenCalledWith(config);
  });
  it("preserves the booking idempotency header when refreshing and replaying", async () => {
    const config = { url: "/bookings", headers: { "Idempotency-Key": "same-booking-key-1234" }, data: { vendorId: "vendor-1" } };
    await rejectResponse({ config, response: { status: 401, data: {} } });
    expect(client).toHaveBeenCalledWith(expect.objectContaining({
      headers: { "Idempotency-Key": "same-booking-key-1234" }, _retry: true,
    }));
  });
});
