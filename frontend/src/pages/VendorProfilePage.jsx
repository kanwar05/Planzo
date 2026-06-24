import {
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  ImagePlus,
  IndianRupee,
  Layers3,
  MapPin,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import Button from "../components/Button";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import Toast from "../components/Toast";
import { services } from "../data/services";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import {
  createVendorProfile,
  getMyVendorProfile,
  updateVendorProfile,
} from "../services/vendorService";
import {
  deletePortfolioImage,
  uploadPortfolioImages,
} from "../services/uploadService";
import { getApiError } from "../utils/apiError";
import { formatCurrency } from "../utils/format";

const initialForm = {
  businessName: "",
  serviceCategory: "",
  description: "",
  experience: "",
  pricing: "",
  location: "",
};

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_PORTFOLIO_IMAGES = 8;

const normalizePortfolioImages = (images = []) =>
  images
    .map((image) =>
      typeof image === "string" ? { url: image, publicId: "" } : image,
    )
    .filter((image) => image?.url);

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
  const [portfolioImages, setPortfolioImages] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const selectedFilesRef = useRef([]);
  const [uploading, setUploading] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState("");
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
        });
        setPortfolioImages(normalizePortfolioImages(profile.portfolioImages));
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

  useEffect(() => {
    selectedFilesRef.current = selectedFiles;
  }, [selectedFiles]);

  useEffect(
    () => () => {
      selectedFilesRef.current.forEach((item) =>
        URL.revokeObjectURL(item.previewUrl),
      );
    },
    [],
  );

  const completion = useMemo(() => {
    const checks = [
      form.businessName,
      form.serviceCategory,
      form.location,
      form.description,
      form.experience !== "",
      form.pricing !== "",
      portfolioImages.length,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [form, portfolioImages.length]);

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
      setPortfolioImages(normalizePortfolioImages(profile.portfolioImages));
    } catch (error) {
      setToast({
        message: getApiError(error, "Unable to save your vendor profile."),
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const selectImages = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (!files.length) return;

    const invalidType = files.find(
      (file) => !ALLOWED_IMAGE_TYPES.has(file.type),
    );
    if (invalidType) {
      setToast({
        message: "Only JPG, JPEG, PNG, and WEBP images are allowed.",
        type: "error",
      });
      return;
    }

    const oversized = files.find((file) => file.size > MAX_IMAGE_SIZE);
    if (oversized) {
      setToast({
        message: "Each portfolio image must be 5MB or smaller.",
        type: "error",
      });
      return;
    }

    if (
      portfolioImages.length + selectedFiles.length + files.length >
      MAX_PORTFOLIO_IMAGES
    ) {
      setToast({
        message: "You can add up to 8 portfolio images in total.",
        type: "error",
      });
      return;
    }

    setSelectedFiles((current) => [
      ...current,
      ...files.map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  };

  const removeSelectedImage = (previewUrl) => {
    URL.revokeObjectURL(previewUrl);
    setSelectedFiles((current) =>
      current.filter((item) => item.previewUrl !== previewUrl),
    );
  };

  const uploadImages = async () => {
    if (!profileExists) {
      setToast({
        message:
          "Please create your vendor profile before uploading portfolio images.",
        type: "error",
      });
      return;
    }

    if (!selectedFiles.length) {
      setToast({
        message: "Select at least one image to upload.",
        type: "error",
      });
      return;
    }

    setUploading(true);
    setToast({ message: "", type: "success" });

    try {
      const profile = await uploadPortfolioImages(
        selectedFiles.map((item) => item.file),
      );
      selectedFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      setSelectedFiles([]);
      setPortfolioImages(normalizePortfolioImages(profile.portfolioImages));
      setToast({
        message: "Portfolio images uploaded successfully.",
        type: "success",
      });
    } catch (error) {
      setToast({
        message: getApiError(error, "Unable to upload portfolio images."),
        type: "error",
      });
    } finally {
      setUploading(false);
    }
  };

  const deleteImage = async (imageUrl) => {
    setDeletingUrl(imageUrl);
    setToast({ message: "", type: "success" });

    try {
      const profile = await deletePortfolioImage(imageUrl);
      setPortfolioImages(normalizePortfolioImages(profile.portfolioImages));
      setToast({
        message: "Portfolio image deleted successfully.",
        type: "success",
      });
    } catch (error) {
      setToast({
        message: getApiError(error, "Unable to delete the portfolio image."),
        type: "error",
      });
    } finally {
      setDeletingUrl("");
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-ink/45">
        Loading profile…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: "", type: "success" })}
      />

      <section className="overflow-hidden rounded-[2rem] border bg-white shadow-soft">
        <div className="bg-gradient-to-r from-[#fff3eb] via-white to-[#f4eadf] p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-coral">
                Business profile builder
              </p>
              <h1 className="mt-2 text-3xl font-extrabold">
                {profileExists
                  ? "Refine your vendor profile"
                  : "Set up your vendor profile"}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-ink/55">
                Add the details customers need before they request a booking:
                category, pricing, location, bio, and portfolio visuals.
              </p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-soft">
              <div className="flex items-center justify-between gap-8">
                <div>
                  <p className="text-sm font-extrabold">Profile strength</p>
                  <p className="mt-1 text-xs text-ink/45">
                    Complete profiles convert better.
                  </p>
                </div>
                <span className="text-3xl font-extrabold text-coral">
                  {completion}%
                </span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-sand">
                <span
                  className="block h-full rounded-full bg-coral"
                  style={{ width: `${completion}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <form onSubmit={submit} className="grid gap-8 xl:grid-cols-[1fr_320px]">
        <main className="space-y-6">
          <Card className="p-6">
            <div className="mb-6 flex items-start gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-coral/10 text-coral">
                <Building2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-extrabold">Business basics</h2>
                <p className="mt-1 text-sm text-ink/45">
                  Name your business and choose the service customers will find.
                </p>
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <label>
                <span className="label">Business name</span>
                <input
                  required
                  name="businessName"
                  value={form.businessName}
                  onChange={change}
                  className="field"
                />
              </label>
              <label>
                <span className="label">Service category</span>
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
              </label>
            </div>
          </Card>

          <Card className="p-6">
            <div className="mb-6 flex items-start gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-plum/10 text-plum">
                <MapPin className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-extrabold">Location & pricing</h2>
                <p className="mt-1 text-sm text-ink/45">
                  Set where you operate and your starting package price.
                </p>
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
              <label className="sm:col-span-1">
                <span className="label">Experience years</span>
                <input
                  required
                  min="0"
                  name="experience"
                  type="number"
                  value={form.experience}
                  onChange={change}
                  className="field"
                />
              </label>
              <label className="sm:col-span-1">
                <span className="label">Starting price</span>
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
              </label>
              <label className="sm:col-span-1">
                <span className="label">Location</span>
                <input
                  required
                  name="location"
                  value={form.location}
                  onChange={change}
                  className="field"
                  placeholder="Mumbai, Maharashtra"
                />
              </label>
            </div>
          </Card>

          <Card className="p-6">
            <div className="mb-6 flex items-start gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sage/10 text-sage">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-extrabold">About / bio</h2>
                <p className="mt-1 text-sm text-ink/45">
                  Explain your style, process, and what customers can expect.
                </p>
              </div>
            </div>
            <label>
              <span className="label">Professional bio</span>
              <textarea
                required
                name="description"
                value={form.description}
                onChange={change}
                className="field min-h-44 resize-none"
              />
            </label>
          </Card>

          <Card id="portfolio" className="p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-coral/10 text-coral">
                  <ImagePlus className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl font-extrabold">Portfolio upload</h2>
                  <p className="mt-1 text-sm text-ink/45">
                    Upload up to 8 JPG, PNG, or WEBP images. Each image can be
                    up to 5MB.
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-sand px-3 py-1 text-xs font-extrabold text-ink/50">
                {portfolioImages.length + selectedFiles.length}/8 images
              </span>
            </div>

            <label className="mt-6 flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-[2rem] border border-dashed border-coral/40 bg-coral/5 p-8 text-center transition hover:bg-coral/10">
              <Upload className="h-8 w-8 text-coral" />
              <p className="mt-3 font-extrabold">Select portfolio images</p>
              <p className="mt-1 text-sm text-ink/45">
                Drag-and-drop style area — click to choose files.
              </p>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                multiple
                onChange={selectImages}
                disabled={
                  uploading ||
                  portfolioImages.length + selectedFiles.length >=
                    MAX_PORTFOLIO_IMAGES
                }
                className="sr-only"
              />
            </label>

            {portfolioImages.length > 0 ? (
              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
                {portfolioImages.map((image) => (
                  <div
                    key={image.url}
                    className="group relative overflow-hidden rounded-2xl border bg-sand"
                  >
                    <img
                      src={image.url}
                      alt="Vendor portfolio"
                      className="h-40 w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => deleteImage(image.url)}
                      disabled={Boolean(deletingUrl)}
                      className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/95 text-red-500 shadow-md transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label="Delete portfolio image"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-6">
                <EmptyState
                  title="No portfolio images yet"
                  description="Upload your best event photos to build trust."
                />
              </div>
            )}

            {selectedFiles.length > 0 && (
              <div className="mt-6">
                <p className="text-xs font-bold uppercase tracking-wider text-ink/45">
                  Ready to upload
                </p>
                <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {selectedFiles.map((item) => (
                    <div
                      key={item.previewUrl}
                      className="relative overflow-hidden rounded-2xl border border-coral/20 bg-sand"
                    >
                      <img
                        src={item.previewUrl}
                        alt={item.file.name}
                        className="h-40 w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeSelectedImage(item.previewUrl)}
                        disabled={uploading}
                        className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/95 shadow-md disabled:opacity-60"
                        aria-label={`Remove ${item.file.name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  onClick={uploadImages}
                  loading={uploading}
                  disabled={uploading || !selectedFiles.length}
                  className="mt-5"
                >
                  <Upload className="h-4 w-4" /> Upload selected images
                </Button>
              </div>
            )}
          </Card>
        </main>

        <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <Card className="p-6">
            <h2 className="text-xl font-extrabold">Profile preview</h2>
            <div className="mt-5 space-y-4">
              <div className="rounded-3xl bg-sand/60 p-4">
                <p className="text-xs font-bold text-ink/40">Business</p>
                <p className="mt-1 font-extrabold">
                  {form.businessName || "Your business name"}
                </p>
              </div>
              <div className="grid gap-3 text-sm">
                <p className="flex items-center gap-2 text-ink/55">
                  <BriefcaseBusiness className="h-4 w-4 text-coral" />
                  {form.serviceCategory || "Service category"}
                </p>
                <p className="flex items-center gap-2 text-ink/55">
                  <MapPin className="h-4 w-4 text-coral" />
                  {form.location || "Location"}
                </p>
                <p className="flex items-center gap-2 text-ink/55">
                  <IndianRupee className="h-4 w-4 text-coral" />
                  {form.pricing ? formatCurrency(form.pricing) : "Starting price"}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-extrabold">Profile checklist</h2>
            <div className="mt-5 space-y-3 text-sm text-ink/60">
              {[
                ["Business name", form.businessName],
                ["Category", form.serviceCategory],
                ["Location", form.location],
                ["Bio", form.description],
                ["Experience", form.experience !== ""],
                ["Pricing", form.pricing !== ""],
                ["Portfolio images", portfolioImages.length],
              ].map(([label, done]) => (
                <p key={label} className="flex items-center justify-between">
                  <span>{label}</span>
                  <BadgeCheck
                    className={`h-4 w-4 ${
                      done ? "fill-sage text-white" : "text-ink/20"
                    }`}
                  />
                </p>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-extrabold">Pricing packages</h2>
            <p className="mt-2 text-sm text-ink/45">
              Planzo currently stores your starting price. Package-specific
              fields can be added later without changing this setup flow.
            </p>
            <div className="mt-5 grid gap-3">
              {["Basic", "Standard", "Premium"].map((name, index) => (
                <div key={name} className="rounded-2xl border border-ink/8 p-4">
                  <div className="flex items-center gap-2">
                    <Layers3 className="h-4 w-4 text-coral" />
                    <p className="font-extrabold">{name}</p>
                  </div>
                  <p className="mt-2 text-sm text-ink/45">
                    {form.pricing
                      ? formatCurrency(Number(form.pricing) * (index + 1))
                      : "Set starting price first"}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Button
            type="submit"
            loading={saving}
            disabled={saving}
            className="w-full"
          >
            <Save className="h-4 w-4" /> Save profile
          </Button>
        </aside>
      </form>
    </div>
  );
}
