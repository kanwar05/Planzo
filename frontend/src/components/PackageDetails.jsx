import { formatMoney, pricingUnits } from "../utils/money";

export default function PackageDetails({ item, advisory = true }) {
  if (!item) return null;
  return <div className="space-y-3 text-sm leading-7">
    <div><h3 className="break-words font-bold">{item.title}</h3><p className="text-xs text-ink/65">{item.serviceCategory}</p></div>
    <p className="whitespace-pre-line break-words">{item.description}</p>
    <p className="font-bold">{item.priceType === "starting" ? "From " : "Fixed price: "}{formatMoney(item.priceAmount)} / {pricingUnits[item.pricingUnit] || item.pricingUnit}</p>
    <ul className="list-disc space-y-1 pl-5">{(item.includedServices || []).map((service, index) => <li key={index} className="break-words">{service}</li>)}</ul>
    {item.exclusions?.length > 0 && <div><h4 className="font-semibold">Exclusions</h4><ul className="list-disc pl-5">{item.exclusions.map((text, index) => <li key={index}>{text}</li>)}</ul></div>}
    {item.addOns?.length > 0 && <div><h4 className="font-semibold">Optional add-ons</h4><ul>{item.addOns.map((addOn, index) => <li key={index}>{addOn.title} · {formatMoney(addOn.priceAmount)} / {pricingUnits[addOn.pricingUnit]}</li>)}</ul></div>}
    {(item.maxDurationMinutes || item.maxQuantity) && <p className="text-xs text-ink/65">{item.maxDurationMinutes ? `Up to ${item.maxDurationMinutes} minutes. ` : ""}{item.maxQuantity ? `Maximum quantity: ${item.maxQuantity}.` : ""}</p>}
    {advisory && <p className="rounded-xl bg-sand p-3 text-xs leading-6 text-ink/70">This package is a guide to your request. No price or payment obligation is agreed until you accept a final quotation.</p>}
  </div>;
}
