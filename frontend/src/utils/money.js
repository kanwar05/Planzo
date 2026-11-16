export const MAX_MONEY_AMOUNT = 100_000_000_000;

export function parseINR(value) {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value.trim()))
    throw new Error("Enter an INR amount with at most two decimal places.");
  const [whole, fraction = ""] = value.trim().split(".");
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (amount > BigInt(MAX_MONEY_AMOUNT)) throw new Error("The INR amount is too large.");
  return Number(amount);
}

export function moneyInput(amount = 0) {
  if (!Number.isSafeInteger(amount) || amount < 0) return "";
  return `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`;
}

export function formatMoney(amount) {
  if (!Number.isSafeInteger(amount) || amount < 0) return "Amount unavailable";
  return `₹${new Intl.NumberFormat("en-IN").format(Math.floor(amount / 100))}.${String(amount % 100).padStart(2, "0")}`;
}

export const pricingUnits = { event: "event", day: "day", hour: "hour", person: "person", item: "item" };
export const textLines = value => value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
