import { useEffect, useRef, useState } from "react";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import PackageDetails from "../components/PackageDetails";
import { WorkspaceHeader } from "../components/dashboard/WorkspacePageParts";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { createPackage, deactivatePackage, getMyPackages, updatePackage } from "../services/packageService";
import { getMyVendorProfile } from "../services/vendorService";
import { getApiError } from "../utils/apiError";
import { moneyInput, parseINR, pricingUnits, textLines } from "../utils/money";

const blank = { title: "", description: "", price: "", priceType: "starting", pricingUnit: "event", includedServices: "", exclusions: "", addOns: "", maxDurationMinutes: "", maxQuantity: "", active: true };
const positiveOptional = value => {
  if (value === "") return null;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error("Duration and quantity must be positive whole numbers.");
  return Number(value);
};
function toForm(item) {
  return { ...item, price: moneyInput(item.priceAmount), includedServices: (item.includedServices || []).join("\n"), exclusions: (item.exclusions || []).join("\n"),
    addOns: (item.addOns || []).map(row => `${row.title} | ${moneyInput(row.priceAmount)} | ${row.pricingUnit}`).join("\n"),
    maxDurationMinutes: item.maxDurationMinutes == null ? "" : String(item.maxDurationMinutes), maxQuantity: item.maxQuantity == null ? "" : String(item.maxQuantity) };
}
function payload(form, category) {
  const includedServices = textLines(form.includedServices);
  if (!includedServices.length) throw new Error("Add at least one included service or deliverable.");
  const addOns = textLines(form.addOns).map(line => {
    const [title, price, pricingUnit, extra] = line.split("|").map(part => part.trim());
    if (!title || !price || !pricingUnits[pricingUnit] || extra !== undefined) throw new Error("Each add-on must use: title | INR amount | pricing unit.");
    return { title, priceAmount: parseINR(price), pricingUnit };
  });
  return { title: form.title.trim(), description: form.description.trim(), serviceCategory: category,
    priceAmount: parseINR(form.price), priceType: form.priceType, pricingUnit: form.pricingUnit,
    includedServices, exclusions: textLines(form.exclusions), addOns,
    maxDurationMinutes: positiveOptional(form.maxDurationMinutes), maxQuantity: positiveOptional(form.maxQuantity), active: form.active };
}

export default function VendorPackagesPage() {
  useDocumentTitle("Service packages");
  const [vendor, setVendor] = useState(null), [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [editing, setEditing] = useState(null), [form, setForm] = useState(blank), [showForm, setShowForm] = useState(false);
  const [unresolved, setUnresolved] = useState(false), [retry, setRetry] = useState(0);
  const lock = useRef(false), attempt = useRef(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    Promise.all([getMyVendorProfile(), getMyPackages()]).then(([profile, items]) => { if (active) { setVendor(profile); setPackages(items || []); } })
      .catch(err => { if (active) setError(getApiError(err, "Unable to load service packages.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  const begin = item => { if (busy || unresolved) return; setEditing(item || null); setForm(item ? toForm(item) : { ...blank }); setShowForm(true); setError(""); setMessage(""); };
  const field = key => ({ value: form[key], onChange: event => setForm(current => ({ ...current, [key]: event.target.value })) });
  const save = async event => {
    event.preventDefault(); if (lock.current) return;
    const retrying = Boolean(attempt.current);
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const body = retrying ? attempt.current.payload : payload(form, vendor.serviceCategory);
      if (!editing) { attempt.current ||= { key: crypto.randomUUID(), payload: body }; setUnresolved(true); }
      const saved = editing ? await updatePackage(editing._id, { ...body, revision: editing.revision }) : await createPackage(body, attempt.current.key);
      setPackages(current => [...current.filter(item => item._id !== saved._id), saved]);
      attempt.current = null; setUnresolved(false); setShowForm(false); setEditing(null); setForm({ ...blank }); setMessage("Package saved.");
    } catch (err) {
      if (!retrying && (!attempt.current || [400, 401, 403, 404, 409, 422, 429].includes(err.response?.status))) { attempt.current = null; setUnresolved(false); }
      setError(getApiError(err, "Unable to save this package."));
    } finally { lock.current = false; setBusy(false); }
  };
  const deactivate = async item => {
    if (lock.current || unresolved) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try { const saved = await deactivatePackage(item._id, item.revision); setPackages(current => current.map(row => row._id === saved._id ? saved : row)); setMessage("Package deactivated. Existing requests and agreements are preserved."); }
    catch (err) { setError(getApiError(err, "Unable to deactivate this package. Reload to check its current revision.")); }
    finally { lock.current = false; setBusy(false); }
  };
  return <div className="space-y-6">
    <WorkspaceHeader eyebrow="Your services" title="Service packages" description="Describe your deliverables and guide prices. Customers agree the final scope and amount through a quotation." action={<Button onClick={() => begin()} disabled={busy || unresolved || !vendor}>Create package</Button>} />
    {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800"><p>{error}</p>{!unresolved && <Button variant="ghost" disabled={busy} onClick={() => { setShowForm(false); setRetry(value => value + 1); }}>Reload packages</Button>}</div>}
    {message && <p role="status" className="rounded-xl bg-sage p-4 text-sm">{message}</p>}
    {loading ? <LoadingSkeleton /> : !vendor ? <EmptyState title="Create your business profile first" description="Packages belong to your vendor listing." actionTo="/vendor/profile-setup" actionLabel="Create profile" /> : <>
      {showForm && <form aria-label="Package editor" onSubmit={save} className="space-y-5 rounded-2xl border bg-white p-5 sm:p-7">
        <h2 className="font-editorial text-2xl">{editing ? "Edit package" : "New package"}</h2>
        {unresolved && !busy && <p role="status" className="rounded-xl bg-sand p-3 text-sm leading-6">The previous response was uncertain. Retry the same package before making changes to avoid duplicates.</p>}
        <fieldset disabled={busy || unresolved} className="grid min-w-0 gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className="label">Package title</span><input required maxLength={120} {...field("title")} className="field" /></label>
          <label className="sm:col-span-2"><span className="label">Package description</span><textarea required maxLength={2000} rows={3} {...field("description")} className="field" /></label>
          <label><span className="label">Service category</span><input readOnly value={vendor.serviceCategory} className="field" /></label>
          <label><span className="label">Price in INR</span><input required inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" {...field("price")} className="field" /></label>
          <label><span className="label">Price type</span><select {...field("priceType")} className="field"><option value="starting">Starting price</option><option value="fixed">Fixed price</option></select></label>
          <label><span className="label">Pricing unit</span><select {...field("pricingUnit")} className="field">{Object.keys(pricingUnits).map(unit => <option key={unit} value={unit}>Per {unit}</option>)}</select></label>
          <label className="sm:col-span-2"><span className="label">Included services and deliverables</span><textarea required rows={4} {...field("includedServices")} className="field" placeholder="One service or deliverable per line" /></label>
          <label className="sm:col-span-2"><span className="label">Exclusions</span><textarea rows={3} {...field("exclusions")} className="field" placeholder="One exclusion per line" /></label>
          <div className="sm:col-span-2"><label><span className="label">Optional add-ons</span><textarea rows={3} {...field("addOns")} className="field" placeholder="Extra hour | 1500.00 | hour" /></label><p className="mt-1 text-xs leading-6 text-ink/65">One per line: title | INR amount | unit (event, day, hour, person or item).</p></div>
          <label><span className="label">Maximum duration (minutes, optional)</span><input type="number" min="1" max="525600" step="1" {...field("maxDurationMinutes")} className="field" /></label>
          <label><span className="label">Maximum quantity (optional)</span><input type="number" min="1" max="1000000" step="1" {...field("maxQuantity")} className="field" /></label>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={form.active} onChange={event => setForm(current => ({ ...current, active: event.target.checked }))} />Available for new requests</label>
        </fieldset>
        <div className="flex flex-wrap gap-3"><Button type="submit" loading={busy}>Save package</Button><Button variant="outline" disabled={busy || unresolved} onClick={() => setShowForm(false)}>Close editor</Button></div>
      </form>}
      {packages.length ? <div className="grid items-start gap-5 lg:grid-cols-2">{packages.map(item => <article key={item._id} className="rounded-2xl border bg-white p-5"><p className="mb-3 text-xs font-semibold">{item.active ? "Active" : "Inactive"} · Revision {item.revision}</p><PackageDetails item={item} /><div className="mt-5 flex flex-wrap gap-3"><Button variant="outline" disabled={busy || unresolved} onClick={() => begin(item)}>Edit {item.title}</Button>{item.active && <Button variant="ghost" disabled={busy || unresolved} onClick={() => deactivate(item)}>Deactivate {item.title}</Button>}</div></article>)}</div> : <EmptyState title="No service packages yet" description="Create a package to describe your scope, deliverables and guide price. Custom booking requests remain available." />}
    </>}
  </div>;
}
