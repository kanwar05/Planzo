import { ImagePlus, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Button from "../components/Button";
import Card from "../components/Card";
import Toast from "../components/Toast";
import { services } from "../data/services";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import {
  createVendorProfile,
  getMyVendorProfile,
  updateVendorProfile,
} from "../services/vendorService";
import { getApiError } from "../utils/apiError";

const initialForm = {
  businessName: "",
  serviceCategory: "",
  description: "",
  experience: "",
  pricing: "",
  location: "",
  portfolioImages: "",
};

export default function VendorProfilePage() {
  useDocumentTitle("Vendor profile setup");
  const location = useLocation();
  const [profileExists, setProfileExists] = useState(false);
  const [form, setForm] = useState({
    ...initialForm,
    businessName: location.state?.businessName || "",
    serviceCategory: location.state?.serviceCategory || "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ message: "", type: "success" });

  useEffect(() => {
    getMyVendorProfile()
      .then((profile) => {
        setProfileExists(true);
        setForm({
          businessName: profile.businessName,
          serviceCategory: profile.serviceCategory,
          description: profile.description,
          experience: profile.experience,
          pricing: profile.pricing,
          location: profile.location,
          portfolioImages: profile.portfolioImages.join("\n"),
        });
      })
      .catch((error) => {
        if (error.response?.status !== 404) {
          setToast({
            message: getApiError(error, "Unable to load your vendor profile."),
            type: "error",
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const change = (event) => {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setToast({ message: "", type: "success" });

    const payload = {
      ...form,
      experience: Number(form.experience),
      pricing: Number(form.pricing),
      portfolioImages: form.portfolioImages
        .split("\n")
        .map((url) => url.trim())
        .filter(Boolean),
    };

    try {
      const profile = profileExists
        ? await updateVendorProfile(payload)
        : await createVendorProfile(payload);
      setProfileExists(true);
      setToast({
        message: "Vendor profile saved successfully.",
        type: "success",
      });
      setForm((current) => ({
        ...current,
        portfolioImages: profile.portfolioImages.join("\n"),
      }));
    } catch (error) {
      setToast({
        message: getApiError(error, "Unable to save your vendor profile."),
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-16 text-center text-sm text-ink/45">Loading profile…</div>;
  }

  return (
    <div className="max-w-4xl">
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: "", type: "success" })}
      />
      <div>
        <p className="text-sm font-bold text-coral">
          Make a memorable first impression
        </p>
        <h1 className="mt-1 text-3xl font-extrabold">
          {profileExists ? "Edit your vendor profile." : "Set up your vendor profile."}
        </h1>
        <p className="mt-2 text-sm text-ink/45">
          Complete profiles receive more relevant booking requests.
        </p>
      </div>
      <form onSubmit={submit} className="mt-7 space-y-6">
        <Card className="grid gap-5 p-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <h2 className="text-lg font-extrabold">Business details</h2>
          </div>
          <div>
            <label className="label">Business name</label>
            <input
              required
              name="businessName"
              value={form.businessName}
              onChange={change}
              className="field"
            />
          </div>
          <div>
            <label className="label">Service category</label>
            <select
              required
              name="serviceCategory"
              value={form.serviceCategory}
              onChange={change}
              className="field"
            >
              <option value="">Select a service</option>
              {services.map((item) => (
                <option key={item.slug}>{item.title}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Description</label>
            <textarea
              required
              name="description"
              value={form.description}
              onChange={change}
              className="field min-h-36 resize-none"
            />
          </div>
          <div>
            <label className="label">Experience (years)</label>
            <input
              required
              min="0"
              name="experience"
              type="number"
              value={form.experience}
              onChange={change}
              className="field"
            />
          </div>
          <div>
            <label className="label">Starting price</label>
            <input
              required
              min="0"
              name="pricing"
              type="number"
              value={form.pricing}
              onChange={change}
              className="field"
              placeholder="80000"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Location</label>
            <input
              required
              name="location"
              value={form.location}
              onChange={change}
              className="field"
              placeholder="Mumbai, Maharashtra"
            />
          </div>
        </Card>
        <Card id="portfolio" className="p-6">
          <h2 className="text-lg font-extrabold">Portfolio</h2>
          <p className="mt-1 text-xs text-ink/40">
            Add one public image URL per line. Cloudinary uploads can be added
            later.
          </p>
          <div className="relative mt-6">
            <ImagePlus className="absolute left-4 top-4 h-5 w-5 text-coral" />
            <textarea
              name="portfolioImages"
              value={form.portfolioImages}
              onChange={change}
              className="field min-h-40 resize-y !pl-12"
              placeholder={"https://example.com/event-1.jpg\nhttps://example.com/event-2.jpg"}
            />
          </div>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" loading={saving} disabled={saving}>
            <Save className="h-4 w-4" /> Save profile
          </Button>
        </div>
      </form>
    </div>
  );
}
