import { ImagePlus, Save, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import {
  deletePortfolioImage,
  uploadPortfolioImages,
} from "../services/uploadService";
import { getApiError } from "../utils/apiError";

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
            Upload up to 8 JPG, PNG, or WEBP images. Each image can be up to 5MB.
          </p>

          {portfolioImages.length > 0 && (
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
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-ink/15 bg-white px-5 py-3 text-sm font-bold text-ink transition hover:-translate-y-0.5 hover:border-coral/50 hover:text-coral">
              <ImagePlus className="h-4 w-4" />
              Select images
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
            <Button
              type="button"
              onClick={uploadImages}
              loading={uploading}
              disabled={uploading || !selectedFiles.length}
            >
              <Upload className="h-4 w-4" /> Upload images
            </Button>
            <span className="text-xs text-ink/40">
              {portfolioImages.length + selectedFiles.length}/8 images
            </span>
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
