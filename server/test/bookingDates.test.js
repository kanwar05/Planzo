import assert from "node:assert/strict";
import { test } from "node:test";
import { assertBookingCompletionDay, normalizeDateOnly, storedBookingDay, utcToday } from "../src/utils/bookingDates.js";

test("marketplace today uses UTC rather than the caller's offset around midnight", () => {
  assert.equal(utcToday(new Date("2028-02-29T23:59:59.999Z")), "2028-02-29");
  assert.equal(utcToday(new Date("2028-03-01T00:00:00.000Z")), "2028-03-01");
  assert.equal(utcToday(new Date("2028-03-01T00:30:00+05:30")), "2028-02-29");
  assert.equal(utcToday(new Date("2028-02-29T23:30:00-05:00")), "2028-03-01");
});

test("date-only normalization rejects timestamp offsets and impossible calendar days", () => {
  assert.equal(normalizeDateOnly("2028-02-29"), "2028-02-29");
  for (const date of ["2027-02-29", "2028-04-31", "2028-2-29", "2028-03-01T00:00:00+05:30", null, 123])
    assert.throws(() => normalizeDateOnly(date), { statusCode: 400 });
});

test("completion starts exactly after the whole UTC event day, including leap day", () => {
  assert.throws(() => assertBookingCompletionDay("2028-02-29", new Date("2028-02-29T23:59:59.999Z")), { statusCode: 409 });
  assert.doesNotThrow(() => assertBookingCompletionDay("2028-02-29", new Date("2028-03-01T00:00:00.000Z")));
  assert.throws(() => assertBookingCompletionDay("2028-03-01", new Date("2028-03-01T00:00:00.000Z")), { statusCode: 409 });
});

test("legacy storage preserves its UTC day and rejects inconsistent or invalid date keys", () => {
  assert.equal(storedBookingDay({ eventDate: new Date("2028-02-29T23:59:59Z") }), "2028-02-29");
  assert.throws(() => storedBookingDay({ eventDate: new Date("2028-03-01T00:00:00Z"), eventDateOnly: "2028-02-29" }), { statusCode: 409 });
  assert.throws(() => storedBookingDay({ eventDate: new Date(NaN) }), { statusCode: 409 });
});
