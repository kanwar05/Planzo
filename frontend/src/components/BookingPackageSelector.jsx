import { useEffect, useState } from "react";
import Button from "./Button";
import PackageDetails from "./PackageDetails";
import { getVendorPackages } from "../services/packageService";
import { getApiError } from "../utils/apiError";

export default function BookingPackageSelector({ vendorId, packageId, onSelect, disabled = false }) {
  const [items, setItems] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setItems([]);
    getVendorPackages(vendorId).then(packages => { if (active) setItems((packages || []).filter(item => item.active)); })
      .catch(err => { if (active) setError(getApiError(err, "Packages could not be loaded.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [vendorId, retry]);
  const selected = items.find(item => item._id === packageId);
  useEffect(() => { onSelect(packageId, selected || null, Boolean(packageId && (loading || !selected))); }, [packageId, selected, loading, onSelect]);
  return <section aria-label="Choose service package" className="mb-6 space-y-4 rounded-xl border bg-sand/40 p-4">
    <label className="block"><span className="label">Service package</span><select className="field" disabled={disabled || loading} value={packageId} onChange={event => onSelect(event.target.value, items.find(item => item._id === event.target.value) || null, false)}><option value="">Custom booking request</option>{packageId && !selected && <option value={packageId}>Selected package unavailable</option>}{items.map(item => <option key={item._id} value={item._id}>{item.title}</option>)}</select></label>
    {loading && <p role="status" className="text-xs">Loading package options…</p>}
    {error && <div className="text-xs text-red-800"><p role="alert">{error}</p><Button variant="ghost" disabled={disabled} onClick={() => setRetry(value => value + 1)}>Retry packages</Button></div>}
    {packageId && !loading && !selected && <p role="alert" className="text-sm leading-6 text-red-800">This package is inactive or unavailable. Choose another package or a custom request.</p>}
    {selected && <PackageDetails item={selected} />}
    {!packageId && <p className="text-xs leading-6 text-ink/65">Describe your event and ask the vendor for a custom quotation.</p>}
  </section>;
}
