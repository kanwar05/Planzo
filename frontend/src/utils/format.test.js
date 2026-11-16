import { describe, expect, it } from "vitest";
import { canCompleteBooking, formatDate, todayDate } from "./format";

describe("UTC marketplace calendar days", () => {
  it("uses the UTC day on both sides of midnight, independent of input zone", () => {
    expect(todayDate(new Date("2027-02-01T05:29:59+05:30"))).toBe("2027-01-31");
    expect(todayDate(new Date("2027-02-01T05:30:00+05:30"))).toBe("2027-02-01");
    expect(todayDate(new Date("2027-01-31T16:00:00-08:00"))).toBe("2027-02-01");
  });
  it("formats date-only values and persisted UTC dates identically", () => {
    expect(formatDate("2027-02-01")).toBe(formatDate("2027-02-01T00:00:00.000Z"));
    expect(formatDate("2027-02-01T00:00:00Z")).toContain("01");
  });
  it.each([null, undefined, "1", "02/03/2020", "2020-02-30", "2020-02-30T00:00:00Z", "2020-02-01T24:00:00Z", {}, 1])("fails closed for malformed legacy date %j", value => {
    expect(formatDate(value)).toBe("Date unavailable");
    expect(canCompleteBooking({ status: "accepted", eventDate: value })).toBe(false);
  });
  it("allows completion only after the whole accepted event day has passed", () => {
    const booking = { status: "accepted", eventDate: "2027-02-01T00:00:00Z", eventDateOnly: "2027-02-01" };
    expect(canCompleteBooking(booking, new Date("2027-02-01T23:59:59.999Z"))).toBe(false);
    expect(canCompleteBooking(booking, new Date("2027-02-02T00:00:00Z"))).toBe(true);
    expect(canCompleteBooking({ ...booking, eventDateOnly: "2027-02-02" }, new Date("2027-02-03T00:00:00Z"))).toBe(false);
    expect(canCompleteBooking({ ...booking, status: "pending" }, new Date("2027-02-03T00:00:00Z"))).toBe(false);
    expect(canCompleteBooking({ status: "accepted", eventDate: "invalid" })).toBe(false);
    expect(canCompleteBooking({ status: "accepted", eventDate: null })).toBe(false);
    expect(canCompleteBooking({ status: "accepted" })).toBe(false);
    expect(canCompleteBooking({ status: "accepted", eventDate: "2020-02-30" })).toBe(false);
  });
});
