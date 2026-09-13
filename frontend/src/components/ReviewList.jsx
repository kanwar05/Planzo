import { MessageSquareReply } from "lucide-react";
import { useState } from "react";
import { formatDate } from "../utils/format";
import Button from "./Button";
import EmptyState from "./EmptyState";
import StarRating from "./StarRating";

export default function ReviewList({
  reviews,
  loading,
  canReply = false,
  replyingId,
  onReply,
}) {
  const [replyText, setReplyText] = useState({});

  if (loading) {
    return <p className="py-8 text-sm text-ink/45">Loading reviews…</p>;
  }
  if (!reviews.length) {
    return (
      <EmptyState
        title="No reviews yet"
        description="Completed-booking reviews will appear here."
      />
    );
  }

  return (
    <div className="divide-y">
      {reviews.map((review) => (
        <article key={review._id} className="py-7 first:pt-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-extrabold">
                {review.customerId?.name || "Planzo customer"}
              </p>
              <p className="mt-1 text-xs text-ink/40">
                {review.bookingId?.eventType || "Verified booking"} ·{" "}
                {formatDate(review.createdAt)}
              </p>
            </div>
            <StarRating value={review.rating} size="h-4 w-4" />
          </div>
          <p className="mt-4 leading-7 text-ink/65">{review.comment}</p>
          {!!review.images?.length && (
            <div className="mt-4 flex flex-wrap gap-3">
              {review.images.map((image) => (
                <img
                  key={image.publicId}
                  src={image.url}
                  alt="Customer review"
                  className="h-24 w-24 rounded-xl object-cover"
                />
              ))}
            </div>
          )}
          {review.vendorReply && (
            <div className="mt-5 rounded-2xl bg-sand/70 p-4">
              <p className="text-xs font-extrabold uppercase tracking-wider text-coral">
                Vendor response
              </p>
              <p className="mt-2 text-sm leading-6 text-ink/65">
                {review.vendorReply.message}
              </p>
            </div>
          )}
          {canReply && (
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <input
                value={replyText[review._id] || review.vendorReply?.message || ""}
                onChange={(event) =>
                  setReplyText((current) => ({
                    ...current,
                    [review._id]: event.target.value,
                  }))
                }
                className="field"
                maxLength="1000"
                placeholder="Reply professionally to this review"
              />
              <Button
                type="button"
                variant="outline"
                disabled={
                  replyingId === review._id ||
                  !(replyText[review._id] || review.vendorReply?.message || "").trim()
                }
                loading={replyingId === review._id}
                onClick={() =>
                  onReply(
                    review._id,
                    (replyText[review._id] || review.vendorReply?.message).trim(),
                  )
                }
                className="shrink-0"
              >
                <MessageSquareReply className="h-4 w-4" /> Reply
              </Button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
