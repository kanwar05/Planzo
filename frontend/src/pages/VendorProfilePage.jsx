import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Button from "../components/Button";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Toast from "../components/Toast";
import { services } from "../data/services";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { createVendorProfile, getMyVendorProfile, updateVendorProfile } from "../services/vendorService";
import { deletePortfolioImage, uploadPortfolioImages } from "../services/uploadService";
import { getApiError } from "../utils/apiError";
const blank = {
  businessName: "",
  serviceCategory: "",
  description: "",
  pricing: "",
  location: "",
  servicesOffered: "",
  contactPhone: "",
  contactEmail: ""
};
const imageUrl = image => typeof image === "string" ? image : image?.url;
const toForm = profile => ({
  businessName: profile.businessName || "",
  serviceCategory: profile.serviceCategory || "",
  description: profile.description || "",
  pricing: profile.pricing ?? "",
  location: profile.location || "",
  servicesOffered: (profile.servicesOffered || []).join("\n"),
  contactPhone: profile.contactDetails?.phone || "",
  contactEmail: profile.contactDetails?.email || ""
});
export default function VendorProfilePage() {
  useDocumentTitle("Business profile");
  const location = useLocation();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    ...blank,
    businessName: location.state?.businessName || "",
    serviceCategory: location.state?.serviceCategory || ""
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState([]);
  const [fileKey, setFileKey] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    getMyVendorProfile().then(data => {
      if (active && data) {
        setProfile(data);
        setForm(toForm(data));
      }
    }).catch(err => {
      if (active && err.response?.status !== 404) setLoadError(getApiError(err, "Unable to load your profile."));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);
  const field = name => ({
    value: form[name],
    onChange: event => setForm(current => ({
      ...current,
      [name]: event.target.value
    }))
  });
  const save = async event => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const servicesOffered = form.servicesOffered.split("\n").map(item => item.trim()).filter(Boolean);
    try {
      if (servicesOffered.length > 20 || servicesOffered.some(item => item.length > 120)) throw new Error("Add up to 20 services, with no more than 120 characters each.");
      const data = {
        businessName: form.businessName.trim(),
        serviceCategory: form.serviceCategory,
        description: form.description.trim(),
        pricing: Number(form.pricing),
        location: form.location.trim(),
        servicesOffered,
        contactDetails: {
          phone: form.contactPhone.trim(),
          email: form.contactEmail.trim()
        }
      };
      const saved = await (profile ? updateVendorProfile(data) : createVendorProfile(data));
      setProfile(saved);
      setForm(toForm(saved));
      setMessage("Business profile saved.");
    } catch (err) {
      setError(getApiError(err, "Unable to save profile."));
    } finally {
      setBusy(false);
    }
  };
  const chooseFiles = event => {
    const next = Array.from(event.target.files || []);
    setError("");
    if (next.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      setFiles([]);
      setFileKey(value => value + 1);
      setError("Use JPEG, PNG, or WebP photos up to 5 MB each.");
      return;
    }
    if ((profile?.portfolioImages?.length || 0) + next.length > 8) {
      setFiles([]);
      setFileKey(value => value + 1);
      setError("You can keep up to 8 business photos.");
      return;
    }
    setFiles(next);
  };
  const upload = async () => {
    if (!files.length) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setProfile(await uploadPortfolioImages(files));
      setFiles([]);
      setFileKey(value => value + 1);
      setMessage("Business photos uploaded.");
    } catch (err) {
      setError(getApiError(err, "Unable to upload photos."));
    } finally {
      setBusy(false);
    }
  };
  const remove = async url => {
    setBusy(true);
    setError("");
    try {
      setProfile(await deletePortfolioImage(url));
      setMessage("Photo removed.");
    } catch (err) {
      setError(getApiError(err, "Unable to remove photo."));
    } finally {
      setBusy(false);
    }
  };
  if (loading) return <LoadingSkeleton />;
  if (loadError) return <EmptyState title="Profile unavailable" description={loadError} actionTo="/vendor/dashboard" actionLabel="Back to dashboard" />;
  return <div className="space-y-7">
    <Toast message={message} onClose={() => setMessage("")} />
    <header>
      <p className="text-xs font-bold uppercase tracking-wider text-coral">Your business on Planzo</p>
      <h1 className="mt-2 text-3xl font-extrabold">
        {profile ? "Manage business profile" : "Create your business profile"}
      </h1>
      <p className="mt-3 text-sm leading-6 text-ink/55">Show customers your services, photos, and starting price.</p>
    </header>
    {profile && <div className="rounded-2xl bg-sand p-4 text-sm leading-6">
      <strong>Approval status: <span className="capitalize">
          {profile.verificationStatus || "pending"}
        </span></strong>
      <p className="mt-1 text-ink/65">
        {profile.verificationRejectionReason || (profile.verificationStatus === "approved" ? "Your business is visible in the marketplace." : "An admin will review your profile before it appears publicly.")}
      </p>
      {profile.verificationStatus === "rejected" && <p className="mt-1 text-ink/65">Save your updated profile to submit it for review again.</p>}
    </div>}
    {error && <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">
      {error}
    </p>}
    <Card className="p-6 sm:p-8">
      <form onSubmit={save} className="grid gap-5 sm:grid-cols-2">
        <label>
          <span className="label">Business name</span>
          <input required maxLength={120} className="field" {...field("businessName")} />
        </label>
        <label>
          <span className="label">Category</span>
          <select required className="field" {...field("serviceCategory")}>
            <option value="">Select a category</option>
            {services.map(item => <option key={item.slug}>
              {item.title}
            </option>)}
          </select>
        </label>
        <label>
          <span className="label">City / location</span>
          <input required maxLength={160} className="field" {...field("location")} />
        </label>
        <label>
          <span className="label">Starting price (INR)</span>
          <input required type="number" min="0" step="1" className="field" {...field("pricing")} />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Business description</span>
          <textarea required rows={5} minLength={10} maxLength={2000} className="field" {...field("description")} />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Services offered</span>
          <textarea rows={4} className="field" placeholder="One service per line, up to 20 services" {...field("servicesOffered")} />
        </label>
        <div className="sm:col-span-2">
          <h2 className="text-xl font-extrabold">Shared business contacts</h2>
          <p className="mt-2 text-sm leading-6 text-ink/55">Only add details you want to share with customers whose bookings you accept. These details are hidden from public profiles. Leave them blank to keep them private.</p>
        </div>
        <label>
          <span className="label">Shared phone (optional)</span>
          <input type="tel" maxLength={30} className="field" {...field("contactPhone")} />
        </label>
        <label>
          <span className="label">Shared email (optional)</span>
          <input type="email" maxLength={254} className="field" {...field("contactEmail")} />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" loading={busy} disabled={busy}>Save business profile</Button>
        </div>
      </form>
    </Card>
    {profile && <Card className="p-6 sm:p-8">
      <h2 className="text-xl font-extrabold">Business photos</h2>
      <p className="mt-2 text-sm text-ink/55">Upload up to 8 JPEG, PNG, or WebP photos, up to 5 MB each.</p>
      {profile.portfolioImages?.length ? <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        {profile.portfolioImages.map(image => <div key={imageUrl(image)}>
          <img src={imageUrl(image)} alt="Your business" className="h-36 w-full rounded-2xl object-cover" />
          <Button variant="ghost" disabled={busy} onClick={() => remove(imageUrl(image))} className="mt-1 !px-2">Remove photo</Button>
        </div>)}
      </div> : <p className="mt-5 text-sm text-ink/50">No business photos uploaded yet.</p>}
      <label className="mt-6 block">
        <span className="label">Choose photos</span>
        <input key={fileKey} type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={chooseFiles} disabled={busy || (profile.portfolioImages?.length || 0) >= 8} className="field" />
      </label>
      <Button className="mt-4" disabled={busy || !files.length} loading={busy} onClick={upload}>Upload {files.length || ""} photos</Button>
    </Card>}
  </div>;
}
