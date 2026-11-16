import { useEffect, useState } from "react";
import Button from "./Button";
import PackageDetails from "./PackageDetails";
import { getVendorPackages } from "../services/packageService";
import { getApiError } from "../utils/apiError";

export default function VendorPackages({ vendorId }) {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setPackages([]);
    getVendorPackages(vendorId).then(items => { if (active) setPackages(items || []); })
      .catch(err => { if (active) setError(getApiError(err, "Unable to load packages.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [vendorId, retry]);
  return <section aria-label="Service packages" className="border-b border-ink/10 py-7 sm:py-9">
    <h2 className="font-editorial text-3xl">Service packages</h2>
    <p className="mt-2 text-xs leading-6 text-ink/65">Start with a package, or send a custom request with your own brief.</p>
    {loading ? <p role="status" className="mt-5 text-sm">Loading packages…</p> : error ? <div role="alert" className="mt-5 text-sm text-red-800"><p>{error}</p><Button variant="ghost" onClick={() => setRetry(value => value + 1)}>Retry packages</Button></div> : packages.filter(item => item.active).length ? <div className="mt-5 grid gap-4">{packages.filter(item => item.active).map(item => <article key={item._id} className="rounded-2xl border bg-white p-5"><PackageDetails item={item} /><Button to={`/booking/${vendorId}`} state={{ packageId: item._id }} className="mt-5 w-full sm:w-auto">Request {item.title}</Button></article>)}</div> : <p className="mt-5 rounded-xl bg-sand p-4 text-sm leading-7">No active packages are listed. You can still send a custom booking request.</p>}
  </section>;
}
