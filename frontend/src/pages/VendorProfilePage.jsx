import { useEffect, useState } from "react";
import { ArrowUpRight, Camera, ImagePlus, LockKeyhole, ShieldCheck, Store, Trash2 } from "lucide-react";
import { useLocation } from "react-router-dom";
import Button from "../components/Button";
import Card from "../components/Card";
import Dialog from "../components/Dialog";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Toast from "../components/Toast";
import { WorkspaceError, WorkspaceHeader, WorkspaceSectionTitle } from "../components/dashboard/WorkspacePageParts";
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
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState([]);
  const [fileKey, setFileKey] = useState(0);
  const [error, setError] = useState("");
  const [errorArea, setErrorArea] = useState("profile");
  const [message, setMessage] = useState("");
  const [photoToRemove, setPhotoToRemove] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
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
  }, [loadAttempt]);
  const field = name => ({
    value: form[name],
    onChange: event => setForm(current => ({
      ...current,
      [name]: event.target.value
    }))
  });
  const save = async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setErrorArea("profile");
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
    setErrorArea("photos");
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
    if (!files.length || busy) return;
    setBusy(true);
    setError("");
    setErrorArea("photos");
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
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setProfile(await deletePortfolioImage(url));
      setPhotoToRemove("");
      setMessage("Photo removed.");
    } catch (err) {
      setError(getApiError(err, "Unable to remove photo."));
    } finally {
      setBusy(false);
    }
  };
  if (loading) return <LoadingSkeleton />;
  if (loadError) return <div className="space-y-6 sm:space-y-8"><WorkspaceHeader eyebrow="Your business on Planzo" title="Business profile" description="Manage the details customers need to discover your business." /><WorkspaceError message={loadError} onRetry={() => setLoadAttempt(attempt => attempt + 1)} /><EmptyState title="Profile unavailable" description="Try again to load your profile, or return to your booking requests." actionTo="/vendor/dashboard" actionLabel="Back to dashboard" /></div>;
  return <div className="space-y-6 sm:space-y-8">
    <Toast message={message} onClose={() => setMessage("")} />
    <WorkspaceHeader eyebrow="Your business on Planzo" title={profile ? "Manage business profile" : "Create your business profile"} description="Make a lovely first impression. Show customers your services, photos, and starting price." action={profile?.verificationStatus === "approved" && profile._id ? <Button to={`/vendors/${profile._id}`} variant="outline">View public profile <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Button> : null} />
    {profile && <div className={`flex items-start gap-3 rounded-2xl p-4 text-sm leading-6 sm:p-5 ${profile.verificationStatus === "approved" ? "bg-sage" : profile.verificationStatus === "rejected" ? "border border-red-200 bg-red-50" : "bg-sand"}`}>
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-coral" aria-hidden="true" />
      <div><strong>Approval status: <span className="capitalize">
          {profile.verificationStatus || "pending"}
        </span></strong>
      <p className="mt-1 break-words text-ink/75">
        {profile.verificationRejectionReason || (profile.verificationStatus === "approved" ? "Your business is visible in the marketplace." : "An admin will review your profile before it appears publicly.")}
      </p>
      {profile.verificationStatus === "rejected" && <p className="mt-1 text-ink/75">Save your updated profile to submit it for review again.</p>}</div>
    </div>}
    <Card className="p-5 sm:p-8">
      <WorkspaceSectionTitle icon={Store} title="Business details" description="The essentials customers need to find their perfect fit." />
      <form onSubmit={save} className="mt-7 grid gap-5 sm:grid-cols-2" aria-label="Business profile" aria-busy={busy}>
        <label>
          <span className="label">Business name</span>
          <input required disabled={busy} maxLength={120} autoComplete="organization" className="field" {...field("businessName")} />
        </label>
        <label>
          <span className="label">Category</span>
          <select required disabled={busy} className="field" {...field("serviceCategory")}>
            <option value="">Select a category</option>
            {services.map(item => <option key={item.slug}>
              {item.title}
            </option>)}
          </select>
        </label>
        <label>
          <span className="label">City / location</span>
          <input required disabled={busy} maxLength={160} autoComplete="address-level2" className="field" {...field("location")} />
        </label>
        <label>
          <span className="label">Starting price (INR)</span>
          <input required disabled={busy} type="number" inputMode="numeric" min="0" step="1" className="field" {...field("pricing")} />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Business description</span>
          <textarea required disabled={busy} rows={5} minLength={10} maxLength={2000} className="field" placeholder="Tell customers what makes your business special" {...field("description")} />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Services offered</span>
          <textarea rows={4} disabled={busy} className="field" placeholder="One service per line, up to 20 services" {...field("servicesOffered")} />
        </label>
        <div className="mt-2 border-t border-ink/10 pt-6 sm:col-span-2">
          <WorkspaceSectionTitle icon={LockKeyhole} title="Shared business contacts" description="Only shared with customers whose bookings you accept. Hidden from your public profile; leave blank to keep private." />
        </div>
        <label>
          <span className="label">Shared phone (optional)</span>
          <input type="tel" disabled={busy} autoComplete="tel" maxLength={30} className="field" {...field("contactPhone")} />
        </label>
        <label>
          <span className="label">Shared email (optional)</span>
          <input type="email" disabled={busy} autoComplete="email" maxLength={254} className="field" {...field("contactEmail")} />
        </label>
        {!photoToRemove && errorArea === "profile" && error && <div className="sm:col-span-2"><WorkspaceError message={error} /></div>}
        <div className="mt-2 border-t border-ink/10 pt-5 sm:col-span-2">
          <Button type="submit" className="w-full sm:w-auto" loading={busy} disabled={busy}>Save business profile</Button>
        </div>
      </form>
    </Card>
    {profile && <Card as="section" aria-label="Business photos" className="min-w-0 p-5 sm:p-8">
      <WorkspaceSectionTitle icon={Camera} title="Business photos" description="Upload up to 8 JPEG, PNG, or WebP photos, up to 5 MB each." aside={<span className="rounded-full bg-sand px-3 py-1.5 text-xs font-bold tabular-nums">{profile.portfolioImages?.length || 0} / 8</span>} />
      {profile.portfolioImages?.length ? <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {profile.portfolioImages.map((image, index) => <div key={imageUrl(image)} className="min-w-0 overflow-hidden rounded-2xl border border-ink/10">
          <img src={imageUrl(image)} alt={`${profile.businessName}, portfolio photo ${index + 1}`} loading="lazy" width="320" height="240" className="aspect-[4/3] w-full object-cover" />
          <Button variant="ghost" disabled={busy} onClick={() => { setError(""); setPhotoToRemove(imageUrl(image)); }} aria-label={`Remove photo ${index + 1}`} className="w-full !rounded-none !px-2 !text-xs !text-red-800"><Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Remove photo</Button>
        </div>)}
      </div> : <div className="mt-6 rounded-2xl border border-dashed border-ink/20 bg-sand/50 p-6 text-center"><ImagePlus className="mx-auto h-7 w-7 text-coral" aria-hidden="true" /><p className="mt-3 text-sm font-bold">No business photos uploaded yet.</p><p className="mt-2 text-sm leading-6 text-ink/65">Let your work tell the story. Add a few of your best moments.</p></div>}
      <label className="mt-6 block min-w-0">
        <span className="label">Choose photos</span>
        <input key={fileKey} type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={chooseFiles} disabled={busy || (profile.portfolioImages?.length || 0) >= 8} className="field min-w-0 !text-xs file:mr-3 file:rounded-full file:border-0 file:bg-sand file:px-3 file:py-2 file:text-xs file:font-bold file:text-ink" />
      </label>
      {!photoToRemove && errorArea === "photos" && error && <div className="mt-4"><WorkspaceError message={error} /></div>}
      <p className="mt-3 text-xs leading-5 text-ink/65" aria-live="polite">{files.length ? `${files.length} ${files.length === 1 ? "photo ready" : "photos ready"} to upload.` : (profile.portfolioImages?.length || 0) >= 8 ? "Your gallery is full. Remove a photo to add another." : "Choose your photos, then upload to add them to your profile."}</p>
      <Button className="mt-4 w-full sm:w-auto" disabled={busy || !files.length} loading={busy} onClick={upload}><ImagePlus className="h-4 w-4" aria-hidden="true" />Upload {files.length || ""} photos</Button>
    </Card>}
    <Dialog open={Boolean(photoToRemove)} onClose={() => { if (!busy) setPhotoToRemove(""); }} title="Remove this photo?" description="This photo will be removed from your business portfolio." footer={<><Button variant="outline" disabled={busy} onClick={() => setPhotoToRemove("")}>Keep photo</Button><Button disabled={busy} loading={busy} onClick={() => remove(photoToRemove)}>Remove photo</Button></>}>
      {photoToRemove && <img src={photoToRemove} alt="Business photo selected for removal" width="480" height="320" className="max-h-64 w-full rounded-2xl object-cover" />}
      <WorkspaceError message={photoToRemove ? error : ""} />
    </Dialog>
  </div>;
}
