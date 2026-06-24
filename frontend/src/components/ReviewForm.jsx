import { ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Button from "./Button";
import StarRating from "./StarRating";

const MAX_IMAGES = 4;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export default function ReviewForm({
  initialReview,
  vendorName,
  submitting,
  onSubmit,
  onCancel,
}) {
  const [rating, setRating] = useState(initialReview?.rating || 0);
  const [comment, setComment] = useState(initialReview?.comment || "");
  const [existingImages, setExistingImages] = useState(
    initialReview?.images || [],
  );
  const [files, setFiles] = useState([]);
  const filesRef = useRef([]);
  const [error, setError] = useState("");

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(
    () => () =>
      filesRef.current.forEach((item) => URL.revokeObjectURL(item.preview)),
    [],
  );

  const selectImages = (event) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = "";

    if (selected.some((file) => !ALLOWED_TYPES.has(file.type))) {
      setError("Only JPG, PNG, and WEBP images are allowed.");
      return;
    }
    if (selected.some((file) => file.size > MAX_IMAGE_SIZE)) {
      setError("Each review image must be 5MB or smaller.");
      return;
    }
    if (existingImages.length + files.length + selected.length > MAX_IMAGES) {
      setError("You can add up to 4 review images.");
      return;
    }

    setError("");
    setFiles((current) => [
      ...current,
      ...selected.map((file) => ({
        file,
        preview: URL.createObjectURL(file),
      })),
    ]);
  };

  const removeNewImage = (preview) => {
    URL.revokeObjectURL(preview);
    setFiles((current) => current.filter((item) => item.preview !== preview));
  };

  const submit = (event) => {
    event.preventDefault();
    if (!rating) {
      setError("Choose a star rating.");
      return;
    }
    if (comment.trim().length < 3) {
      setError("Write at least 3 characters about your experience.");
      return;
    }

    const originalIds = (initialReview?.images || []).map(
      (image) => image.publicId,
    );
    const keptIds = existingImages.map((image) => image.publicId);

    onSubmit({
      rating,
      comment: comment.trim(),
      images: files.map((item) => item.file),
      removeImagePublicIds: originalIds.filter((id) => !keptIds.includes(id)),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-coral">
          Verified booking
        </p>
        <h2 className="mt-2 text-2xl font-extrabold">
          {initialReview ? "Edit your review" : `Review ${vendorName}`}
        </h2>
      </div>
      <div>
        <label className="label">Your rating</label>
        <StarRating value={rating} onChange={setRating} />
      </div>
      <div>
        <label className="label">Your experience</label>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          className="field min-h-32 resize-none"
          maxLength="2000"
          placeholder="What went well? What should future customers know?"
        />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="label">Photos (optional)</label>
          <span className="text-xs text-ink/35">
            {existingImages.length + files.length}/4
          </span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {existingImages.map((image) => (
            <div key={image.publicId} className="relative">
              <img
                src={image.url}
                alt=""
                className="h-20 w-full rounded-xl object-cover"
              />
              <button
                type="button"
                onClick={() =>
                  setExistingImages((current) =>
                    current.filter((item) => item.publicId !== image.publicId),
                  )
                }
                className="absolute right-1 top-1 rounded-full bg-ink p-1 text-white"
                aria-label="Remove review image"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {files.map((item) => (
            <div key={item.preview} className="relative">
              <img
                src={item.preview}
                alt=""
                className="h-20 w-full rounded-xl object-cover"
              />
              <button
                type="button"
                onClick={() => removeNewImage(item.preview)}
                className="absolute right-1 top-1 rounded-full bg-ink p-1 text-white"
                aria-label="Remove selected image"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {existingImages.length + files.length < MAX_IMAGES && (
            <label className="grid h-20 cursor-pointer place-items-center rounded-xl border border-dashed border-ink/20 text-ink/40">
              <ImagePlus className="h-5 w-5" />
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={selectImages}
              />
            </label>
          )}
        </div>
      </div>
      {error && <p className="text-sm font-semibold text-red-500">{error}</p>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting} disabled={submitting}>
          {initialReview ? "Save changes" : "Publish review"}
        </Button>
      </div>
    </form>
  );
}
