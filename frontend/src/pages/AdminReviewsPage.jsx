import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, Flag } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import EmptyState from "../components/EmptyState";
import Button from "../components/Button";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Toast from "../components/Toast";
import {api} from "../services/api";
import { getApiError } from "../utils/apiError";

export default function AdminReviewsPage() {
  useDocumentTitle("Moderate Reviews - Admin");
  const navigate = useNavigate();
  const { user } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deletingId, setDeletingId] = useState("");

  useEffect(() => {
    if (user?.role !== "admin") {
      navigate("/");
      return;
    }

    loadReviews();
  }, [user, navigate]);

  const loadReviews = async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/admin/reviews", {
        params: { page, limit: 10 },
      });
      setReviews(response.data.data?.reviews || response.data.reviews || []);
      setPagination(response.data.data?.pagination || response.data.pagination);
    } catch (err) {
      setError(getApiError(err, "Failed to load reviews"));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReview = async (reviewId) => {
    if (!window.confirm("Are you sure you want to delete this review?")) {
      return;
    }
    setDeletingId(reviewId);
    setError("");
    try {
      await api.delete(`/admin/reviews/${reviewId}`);
      setReviews((prev) => prev.filter((r) => r._id !== reviewId));
      setSuccess("Review deleted successfully");
    } catch (err) {
      setError(getApiError(err, "Failed to delete review"));
    } finally {
      setDeletingId("");
    }
  };

  const handleFlagReview = async (reviewId) => {
    setDeletingId(reviewId);
    setError("");
    try {
      await api.post(`/admin/reviews/${reviewId}/flag`);
      setSuccess("Review flagged for review");
    } catch (err) {
      setError(getApiError(err, "Failed to flag review"));
    } finally {
      setDeletingId("");
    }
  };

  if (user?.role !== "admin") {
    return (
      <section className="section-pad container-shell min-h-screen">
        <EmptyState
          title="Access Denied"
          description="You do not have permission to access this page."
        />
      </section>
    );
  }

  return (
    <section className="section-pad container-shell">
      <Toast
        message={error || success}
        type={error ? "error" : "success"}
        onClose={() => {
          setError("");
          setSuccess("");
        }}
      />

      <div className="max-w-6xl">
        <div className="mb-8">
          <Button to="/admin" variant="outline" size="sm" className="mb-4">
            ← Back to Dashboard
          </Button>
          <h1 className="text-4xl font-extrabold">Moderate Reviews</h1>
          <p className="mt-2 text-ink/50">
            Review and manage user reviews
          </p>
        </div>

        {loading ? (
          <LoadingSkeleton />
        ) : error && reviews.length === 0 ? (
          <EmptyState title="Failed to load reviews" description={error} />
        ) : reviews.length === 0 ? (
          <EmptyState
            title="No reviews found"
            description="There are no reviews to moderate."
          />
        ) : (
          <>
            <div className="grid gap-6">
              {reviews.map((review) => (
                <div
                  key={review._id}
                  className="rounded-[1.75rem] border bg-white p-6 shadow-soft"
                >
                  <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-bold">
                            {review.vendorId?.businessName || "Unknown Vendor"}
                          </h3>
                          <p className="text-sm text-ink/60">
                            By {review.customerId?.name || "Unknown User"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span
                              key={i}
                              className={
                                i < review.rating
                                  ? "text-yellow-400"
                                  : "text-gray-300"
                              }
                            >
                              ★
                            </span>
                          ))}
                        </div>
                      </div>
                      <p className="mt-3 text-sm text-ink/70">
                        {review.comment}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {review.images?.map((img, idx) => (
                          <img
                            key={idx}
                            src={img.url}
                            alt="review"
                            className="h-20 w-20 rounded-lg object-cover"
                          />
                        ))}
                      </div>
                      <p className="mt-4 text-xs text-ink/50">
                        Posted on{" "}
                        {new Date(review.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex flex-col gap-3">
                      <Button
                        onClick={() => handleFlagReview(review._id)}
                        disabled={deletingId === review._id}
                        variant="outline"
                        className="flex items-center gap-2"
                      >
                        <Flag className="h-4 w-4" />
                        Flag
                      </Button>
                      <Button
                        onClick={() => handleDeleteReview(review._id)}
                        disabled={deletingId === review._id}
                        className="flex items-center gap-2 bg-red-600 hover:bg-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="mt-8 flex justify-center gap-2">
                {Array.from({ length: pagination.pages }).map((_, i) => (
                  <button
                    key={i + 1}
                    onClick={() => loadReviews(i + 1)}
                    className={`px-4 py-2 rounded-lg border font-semibold ${
                      pagination.page === i + 1
                        ? "bg-coral text-white border-coral"
                        : "bg-white hover:bg-gray-50"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
