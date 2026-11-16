import { formatDate } from "../utils/format";
import { formatMoney } from "../utils/money";

const instant = value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date)} UTC` : "Unavailable";
};
export default function QuotationDetails({ quotation, accepted = false }) {
  if (!quotation) return null;
  return <section aria-label={accepted ? "Accepted agreement" : `Quotation revision ${quotation.revision}`} className="space-y-4 rounded-xl border border-ink/10 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-bold">{accepted ? "Accepted agreement" : "Quotation"} · Version {quotation.revision}</h4><p className="mt-1 text-xs text-ink/65">Service date: {formatDate(quotation.serviceDate)} (UTC)</p></div><strong className="text-lg">{formatMoney(quotation.totalAmount)} INR</strong></div>
    <p className="whitespace-pre-line break-words text-sm leading-7">{quotation.serviceDescription}</p>
    {(quotation.selectedPackageTitle || quotation.selectedPackage?.title) && <p className="text-xs text-ink/65">Based on package: {quotation.selectedPackageTitle || quotation.selectedPackage.title}</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-xs sm:text-sm"><thead><tr className="border-b"><th className="py-2 pr-3">Service</th><th className="px-2 py-2">Qty</th><th className="px-2 py-2">Unit price</th><th className="py-2 pl-2 text-right">Amount</th></tr></thead><tbody>{(quotation.items || []).map((item, index) => <tr key={index} className="border-b border-ink/5"><td className="min-w-32 break-words py-3 pr-3">{item.description}</td><td className="px-2 py-3">{item.quantity}</td><td className="whitespace-nowrap px-2 py-3">{formatMoney(item.unitPriceAmount)}</td><td className="whitespace-nowrap py-3 pl-2 text-right">{formatMoney(item.quantity * item.unitPriceAmount)}</td></tr>)}</tbody></table></div>
    <dl className="space-y-2 text-sm">{(quotation.additionalCharges || []).map((charge, index) => <div key={index} className="flex justify-between gap-4"><dt className="break-words">{charge.description}</dt><dd className="shrink-0">{formatMoney(charge.amount)}</dd></div>)}{quotation.discountAmount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>−{formatMoney(quotation.discountAmount)}</dd></div>}<div className="flex justify-between border-t pt-3 font-bold"><dt>{accepted ? "Agreed total" : "Quotation total"}</dt><dd>{formatMoney(quotation.totalAmount)} INR</dd></div></dl>
    {quotation.deliverables?.length > 0 && <div><h5 className="text-sm font-bold">Agreed deliverables</h5><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-7">{quotation.deliverables.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
    {quotation.exclusions?.length > 0 && <div><h5 className="text-sm font-bold">Exclusions</h5><ul className="mt-2 list-disc pl-5 text-sm leading-7">{quotation.exclusions.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
    {quotation.terms && <div><h5 className="text-sm font-bold">Terms and conditions</h5><p className="mt-2 whitespace-pre-line break-words text-sm leading-7">{quotation.terms}</p></div>}
    <p className="text-xs leading-6 text-ink/65">{accepted ? `Accepted: ${instant(quotation.acceptedAt)}. This snapshot is preserved even if packages or profiles change.` : `Expires: ${instant(quotation.expiresAt)}. Review the entire scope and conditions before accepting.`}</p>
    <p className="rounded-xl bg-sand p-3 text-xs leading-6">{accepted ? "This records your commercial agreement. No online payment is collected." : "The package guide price is not an obligation. Only your explicit acceptance agrees this quotation."}</p>
  </section>;
}
