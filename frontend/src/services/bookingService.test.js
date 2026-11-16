import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { createBooking } from "./bookingService";
vi.mock("./api", () => ({ api: { post: vi.fn() } }));
describe("booking request retries", () => {
  beforeEach(() => { vi.clearAllMocks(); api.post.mockResolvedValue({ data: { booking: { _id: "same-booking" } } }); });
  it("sends the durable request key as a header, outside the booking data", async () => {
    const payload = { vendorId: "vendor-1", eventDate: "2027-02-01" };
    expect(await createBooking(payload, { idempotencyKey: "request-key-123456" })).toEqual({ _id: "same-booking" });
    expect(api.post).toHaveBeenCalledWith("/bookings", payload, { headers: { "Idempotency-Key": "request-key-123456" } });
  });
});
