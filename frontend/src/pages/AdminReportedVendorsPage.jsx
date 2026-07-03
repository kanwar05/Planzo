import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import EmptyState from "../components/EmptyState";
import Button from "../components/Button";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Toast from "../components/Toast";
import {api} from "../services/api";
import { getApiError } from "../utils/apiError";

export default function AdminReportedVendorsPage() {
  useDocumentTitle("Reported Vendors - Admin");
  const navigate = useNavigate();
  const { user } = useAuth();
  const [vendors, setVendors] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [resolvingId, setResolvingId] = useState("");

  useEffect(() => {
    if (user?.role !== "admin") {
      navigate("/");
      return;
    }

    loadVendors();
  }, [user, navigate]);

  const loadVendors = async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/admin/vendors/reported", {
        params: { page, limit: 10 },
      });
      setVendors(response.data.data?.vendors || response.data.vendors || []);
      setPagination(response.data.data?.pagination || response.data.pagination);
    } catch (err) {
      setError(getApiError(err, "Failed to load reported vendors"));
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async (vendorId) => {
    setResolvingId(vendorId);
    setError("");
    try {
      await api.patch(`/admin/vendors/${vendorId}/report-resolution`, {
        action: "dismiss",
      });
      setVendors((prev) => prev.filter((v) => v._id !== vendorId));
      setSuccess("Report dismissed");
    } catch (err) {
      setError(getApiError(err, "Failed to dismiss report"));
    } finally {
      setResolvingId("");
    }
  };

  const handleSuspend = async (vendorId) => {
    setResolvingId(vendorId);
    setError("");
    try {
      await api.patch(`/admin/vendors/${vendorId}/report-resolution`, {
        action: "suspend",
      });
      setVendors((prev) => prev.filter((v) => v._id !== vendorId));
      setSuccess("Vendor suspended");
    } catch (err) {
      setError(getApiError(err, "Failed to suspend vendor"));
    } finally {
      setResolvingId("");
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
          <h1 className="text-4xl font-extrabold">Reported Vendors</h1>
          <p className="mt-2 text-ink/50">
            Review and handle vendor reports
          </p>
        </div>

        {loading ? (
          <LoadingSkeleton />
        ) : error && vendors.length === 0 ? (
          <EmptyState title="Failed to load vendors" description={error} />
        ) : vendors.length === 0 ? (
          <EmptyState
            title="No reported vendors"
            description="All vendors are in good standing."
          />
        ) : (
          <>
            <div className="grid gap-6">
              {vendors.map((vendor) => (
                <div
                  key={vendor._id}
                  className="rounded-[1.75rem] border border-red-200 bg-red-50 p-6"
                >
                  <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-red-600" />
                            <h3 className="text-lg font-bold">
                              {vendor.businessName}
                            </h3>
                          </div>
                          <p className="text-sm text-ink/60">
                            {vendor.serviceCategory} • {vendor.location}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4">
                        <p className="font-semibold text-red-600">
                          Report Reasons
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {vendor.reportReasons?.map((reason, idx) => (
                            <span
                              key={idx}
                              className="inline-block rounded-full bg-red-100 px-3 py-1 text-sm text-red-700"
                            >
                              {reason}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="font-semibold text-ink/60">Rating</p>
                          <p>
                            {vendor.averageRating?.toFixed(1) || "N/A"} ★
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold text-ink/60">
                            Reported on
                          </p>
                          <p>
                            {new Date(vendor.updatedAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold text-ink/60">Contact</p>
                          <p className="text-xs">{vendor.userId?.email}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <Button
                        onClick={() => handleDismiss(vendor._id)}
                        disabled={resolvingId === vendor._id}
                        variant="outline"
                      >
                        Dismiss
                      </Button>
                      <Button
                        onClick={() => handleSuspend(vendor._id)}
                        disabled={resolvingId === vendor._id}
                        className="flex items-center gap-2 bg-red-600 hover:bg-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                        Suspend
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
                    onClick={() => loadVendors(i + 1)}
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
