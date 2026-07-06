import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, FileText, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import EmptyState from "../components/EmptyState";
import Button from "../components/Button";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Toast from "../components/Toast";
import {api} from "../services/api";
import { getApiError } from "../utils/apiError";

export default function AdminUnverifiedVendorsPage() {
  useDocumentTitle("Verify Vendors - Admin");
  const navigate = useNavigate();
  const { user } = useAuth();
  const [vendors, setVendors] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [verifyingId, setVerifyingId] = useState("");

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
      const response = await api.get("/admin/vendors/unverified", {
        params: { page, limit: 10 },
      });
      setVendors(response.data.data?.vendors || response.data.vendors || []);
      setPagination(response.data.data?.pagination || response.data.pagination);
    } catch (err) {
      setError(getApiError(err, "Failed to load vendors"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (vendorId) => {
    setVerifyingId(vendorId);
    setError("");
    try {
      await api.patch(`/admin/vendors/${vendorId}/verify`);
      setVendors((prev) => prev.filter((v) => v._id !== vendorId));
      setSuccess("Vendor verified successfully!");
    } catch (err) {
      setError(getApiError(err, "Failed to verify vendor"));
    } finally {
      setVerifyingId("");
    }
  };

  const handleReject = async (vendorId) => {
    const reason = window.prompt("Add a rejection reason for this vendor (optional):");
    setVerifyingId(vendorId);
    setError("");
    try {
      await api.patch(`/admin/vendors/${vendorId}/reject`, {
        reason: reason || "",
      });
      setVendors((prev) => prev.filter((v) => v._id !== vendorId));
      setSuccess("Vendor rejected");
    } catch (err) {
      setError(getApiError(err, "Failed to reject vendor"));
    } finally {
      setVerifyingId("");
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
          <h1 className="text-4xl font-extrabold">Verify Vendors</h1>
          <p className="mt-2 text-ink/50">
            Review and approve new vendor profiles
          </p>
        </div>

        {loading ? (
          <LoadingSkeleton />
        ) : error && vendors.length === 0 ? (
          <EmptyState title="Failed to load vendors" description={error} />
        ) : vendors.length === 0 ? (
          <EmptyState
            title="No vendors to verify"
            description="All vendors have been verified or no new vendors are pending."
          />
        ) : (
          <>
            <div className="grid gap-6">
              {vendors.map((vendor) => (
                <div
                  key={vendor._id}
                  className="rounded-[1.75rem] border bg-white p-6 shadow-soft"
                >
                  <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-bold">
                            {vendor.businessName}
                          </h3>
                          <p className="text-sm text-ink/60">
                            {vendor.serviceCategory} • {vendor.location}
                          </p>
                        </div>
                      </div>
                      <p className="mt-3 text-sm text-ink/70">
                        {vendor.description}
                      </p>
                      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="font-semibold text-ink/60">Experience</p>
                          <p>{vendor.experience} years</p>
                        </div>
                        <div>
                          <p className="font-semibold text-ink/60">Pricing</p>
                          <p>₹{vendor.pricing.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-ink/60">Applied on</p>
                          <p>
                            {new Date(vendor.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4">
                        <p className="font-semibold text-ink/60">Vendor</p>
                        <p>{vendor.userId?.name}</p>
                        <p className="text-sm text-ink/60">
                          {vendor.userId?.email}
                        </p>
                      </div>
                      <div className="mt-4 rounded-2xl border border-ink/8 bg-sand/40 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold text-ink/60">Verification</p>
                          <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                            vendor.verificationStatus === "approved"
                              ? "bg-emerald-50 text-emerald-700"
                              : vendor.verificationStatus === "rejected"
                                ? "bg-red-50 text-red-700"
                                : "bg-white text-ink/60"
                          }`}>
                            {vendor.verificationStatus || "pending"}
                          </span>
                        </div>
                        {vendor.verificationRejectionReason ? (
                          <p className="mt-3 text-sm text-red-600">
                            {vendor.verificationRejectionReason}
                          </p>
                        ) : null}
                        {Array.isArray(vendor.verificationDocuments) && vendor.verificationDocuments.length > 0 ? (
                          <div className="mt-3 space-y-2">
                            {vendor.verificationDocuments.map((document, index) => (
                              <a
                                key={`${document.url}-${index}`}
                                href={document.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 text-sm font-semibold text-coral"
                              >
                                <FileText className="h-4 w-4" />
                                {document.originalName || `Document ${index + 1}`}
                              </a>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-ink/60">
                            No documents uploaded yet.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <Button
                        onClick={() => handleVerify(vendor._id)}
                        disabled={verifyingId === vendor._id}
                        className="flex items-center gap-2"
                      >
                        <Check className="h-4 w-4" />
                        Verify
                      </Button>
                      <Button
                        onClick={() => handleReject(vendor._id)}
                        disabled={verifyingId === vendor._id}
                        variant="outline"
                        className="flex items-center gap-2"
                      >
                        <X className="h-4 w-4" />
                        Reject
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
