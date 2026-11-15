import { describe, expect, it } from "vitest";
import { formatMoney, moneyInput, parseINR } from "./money";
describe("integer INR amounts", () => {
  it.each([["0", 0], ["0.10", 10], ["1.01", 101], ["100.5", 10050], ["999999999.99", 99999999999]])("converts %s without floating point rounding", (value, paise) => {
    expect(parseINR(value)).toBe(paise);
    expect(parseINR(moneyInput(paise))).toBe(paise);
  });
  it.each(["-1", "1.001", "1e3", "Infinity", "NaN", "1,000", "", ".5", "1000000000.01", {}, 1])("rejects invalid money %j", value => expect(() => parseINR(value)).toThrow());
  it("displays exact paise and rejects corrupt amounts", () => {
    expect(formatMoney(10001)).toBe("₹100.01");
    expect(formatMoney(10000001)).toBe("₹1,00,000.01");
    expect(formatMoney(-1)).toBe("Amount unavailable");
  });
});
