import { Star } from "lucide-react";

export default function StarRating({
  value = 0,
  onChange,
  size = "h-6 w-6",
  label = "Rating",
}) {
  const interactive = typeof onChange === "function";

  return (
    <div className="flex items-center gap-1" aria-label={`${label}: ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          onClick={() => onChange?.(star)}
          className={interactive ? "transition hover:scale-110" : ""}
          aria-label={interactive ? `Rate ${star} out of 5` : undefined}
        >
          <Star
            className={`${size} ${
              star <= value
                ? "fill-amber-400 text-amber-400"
                : "text-ink/15"
            }`}
          />
        </button>
      ))}
    </div>
  );
}
