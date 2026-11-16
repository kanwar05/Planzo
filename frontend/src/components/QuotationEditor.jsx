import { useRef, useState } from "react";
import Button from "./Button";
import { formatDate } from "../utils/format";
import { moneyInput, parseINR, textLines } from "../utils/money";
import { getApiError } from "../utils/apiError";
import { sendQuotation } from "../services/quotationService";

const emptyItem = () => ({ description: "", quantity: "1", price: "" });
const localDateTime = value => {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = number => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
export default function QuotationEditor({ booking, previous, onSaved, onClose }) {
  const selected = booking.selectedPackage;
  const [description, setDescription] = useState(previous?.serviceDescription || selected?.description || booking.description || "");
  const [items, setItems] = useState(previous?.items?.map(item => ({ description: item.description, quantity: String(item.quantity), price: moneyInput(item.unitPriceAmount) })) || (selected ? [{ description: selected.title, quantity: "1", price: moneyInput(selected.priceAmount) }] : [emptyItem()]));
  const [charges, setCharges] = useState(previous?.additionalCharges?.map(row => ({ description: row.description, price: moneyInput(row.amount) })) || []);
  const [discount, setDiscount] = useState(moneyInput(previous?.discountAmount || 0));
  const [deliverables, setDeliverables] = useState((previous?.deliverables || selected?.includedServices || []).join("\n"));
  const [exclusions, setExclusions] = useState((previous?.exclusions || selected?.exclusions || []).join("\n"));
  const [terms, setTerms] = useState(previous?.terms || "");
  const [expiry, setExpiry] = useState(localDateTime(previous?.expiresAt));
  const [busy, setBusy] = useState(false), [unresolved, setUnresolved] = useState(false), [error, setError] = useState("");
  const lock = useRef(false), attempt = useRef(null);
  const serviceDate = booking.eventDateOnly || booking.eventDate?.slice(0, 10);
  const editItem = (index, key, value) => setItems(current => current.map((row, position) => position === index ? { ...row, [key]: value } : row));
  const submit = async event => {
    event.preventDefault(); if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    const retrying = Boolean(attempt.current);
    try {
      let body = attempt.current?.payload;
      if (!body) {
        const expires = new Date(expiry);
        if (!expiry || !Number.isFinite(expires.getTime()) || expires.getTime() <= Date.now()) throw new Error("Choose a future quotation expiry.");
        const parsedItems = items.map(row => {
          if (!/^[1-9]\d*$/.test(row.quantity) || Number(row.quantity) > 1_000_000) throw new Error("Quantities must be positive whole numbers up to 1,000,000.");
          return { description: row.description.trim(), quantity: Number(row.quantity), unitPriceAmount: parseINR(row.price) };
        });
        body = { expectedRevision: booking.quotationRevision || 0, serviceDescription: description.trim(), items: parsedItems,
          additionalCharges: charges.map(row => ({ description: row.description.trim(), amount: parseINR(row.price) })), discountAmount: parseINR(discount),
          serviceDate, deliverables: textLines(deliverables), exclusions: textLines(exclusions), terms: terms.trim(), expiresAt: expires.toISOString() };
        attempt.current = { key: crypto.randomUUID(), payload: body };
      }
      setUnresolved(true);
      const result = await sendQuotation(booking._id, body, attempt.current.key);
      attempt.current = null; setUnresolved(false); await onSaved(result);
    } catch (err) {
      if (!retrying && (!attempt.current || [400, 401, 403, 404, 409, 422, 429].includes(err.response?.status))) { attempt.current = null; setUnresolved(false); }
      setError(getApiError(err, "Unable to send quotation. Reload history if the request changed."));
    } finally { lock.current = false; setBusy(false); }
  };
  return <form onSubmit={submit} aria-label="Quotation editor" className="space-y-5 rounded-xl border bg-sand/30 p-4 sm:p-5">
    <div><h4 className="font-bold">{previous ? "Revise quotation" : "Create quotation"}</h4><p className="mt-2 text-xs leading-6">Service date: {formatDate(serviceDate)} UTC. This quotation cannot change the booking date. The server calculates the final total in INR.</p></div>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {unresolved && !busy && <p role="status" className="rounded-xl bg-white p-3 text-xs leading-6">Delivery of this quotation is uncertain. Retry the same version before editing to avoid duplicate revisions.</p>}
    <fieldset disabled={busy || unresolved} className="space-y-4">
      <label className="block"><span className="label">Service description</span><textarea required maxLength={2000} rows={3} value={description} onChange={event => setDescription(event.target.value)} className="field" /></label>
      <div className="space-y-3"><h5 className="text-sm font-bold">Itemized services</h5>{items.map((row, index) => <div key={index} className="grid gap-3 rounded-xl bg-white p-3 sm:grid-cols-[minmax(0,1fr)_80px_110px_auto]">
        <label><span className="label">Item {index + 1}</span><input required maxLength={300} value={row.description} onChange={event => editItem(index, "description", event.target.value)} className="field" /></label>
        <label><span className="label">Quantity {index + 1}</span><input required type="number" min="1" max="1000000" step="1" value={row.quantity} onChange={event => editItem(index, "quantity", event.target.value)} className="field" /></label>
        <label><span className="label">Unit INR {index + 1}</span><input required inputMode="decimal" value={row.price} onChange={event => editItem(index, "price", event.target.value)} className="field" /></label>
        <Button variant="ghost" disabled={items.length === 1} onClick={() => setItems(current => current.filter((_, position) => position !== index))}>Remove item {index + 1}</Button>
      </div>)}<Button variant="outline" disabled={items.length >= 50} onClick={() => setItems(current => [...current, emptyItem()])}>Add service item</Button></div>
      <div className="space-y-3"><h5 className="text-sm font-bold">Additional charges</h5>{charges.map((row, index) => <div key={index} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px_auto]"><label><span className="label">Charge description {index + 1}</span><input required maxLength={300} value={row.description} onChange={event => setCharges(current => current.map((charge, position) => position === index ? { ...charge, description: event.target.value } : charge))} className="field" /></label><label><span className="label">Charge INR {index + 1}</span><input required inputMode="decimal" value={row.price} onChange={event => setCharges(current => current.map((charge, position) => position === index ? { ...charge, price: event.target.value } : charge))} className="field" /></label><Button variant="ghost" onClick={() => setCharges(current => current.filter((_, position) => position !== index))}>Remove charge {index + 1}</Button></div>)}<Button variant="outline" disabled={charges.length >= 20} onClick={() => setCharges(current => [...current, { description: "", price: "" }])}>Add charge</Button></div>
      <div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Discount in INR</span><input required inputMode="decimal" value={discount} onChange={event => setDiscount(event.target.value)} className="field" /></label><div><label><span className="label">Expiry (your local time)</span><input required type="datetime-local" value={expiry} onChange={event => setExpiry(event.target.value)} className="field" /></label><p className="text-xs leading-6 text-ink/65">Submitted as an exact UTC instant; customers see expiry in UTC.</p></div></div>
      <label className="block"><span className="label">Agreed deliverables</span><textarea required rows={3} value={deliverables} onChange={event => setDeliverables(event.target.value)} className="field" placeholder="One deliverable per line" /></label>
      <label className="block"><span className="label">Quotation exclusions</span><textarea rows={3} value={exclusions} onChange={event => setExclusions(event.target.value)} className="field" placeholder="One exclusion per line" /></label>
      <label className="block"><span className="label">Terms and conditions</span><textarea maxLength={4000} rows={4} value={terms} onChange={event => setTerms(event.target.value)} className="field" /></label>
    </fieldset>
    <div className="flex flex-wrap gap-3"><Button type="submit" loading={busy}>Send quotation</Button><Button variant="outline" disabled={busy || unresolved} onClick={onClose}>Close quotation editor</Button></div>
  </form>;
}
