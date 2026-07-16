import { useEffect, useState } from "react";
import { Check, ExternalLink, FileText, RefreshCw, X } from "lucide-react";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Toast from "../components/Toast";
import {
  getVerifications,
  reviewVerification,
} from "../services/verificationService";
import { getApiError } from "../utils/apiError";

const LABELS = {
  governmentId: "Government ID",
  businessLicense: "Business License",
  gstCertificate: "GST Certificate",
  panCard: "PAN Card",
  profilePhoto: "Profile Photo",
};

export default function AdminVerifyVendorsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reasonFor, setReasonFor] = useState(null);
  const [reason, setReason] = useState("");
  const load = () => {
    setLoading(true);
    getVerifications({ status: "pending" })
      .then((data) => setItems(data.verifications))
      .catch((e) => setError(getApiError(e, "Unable to load submissions.")))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  const review = async (item, status) => {
    if (status !== "approved" && reasonFor !== `${item._id}:${status}`) {
      setReasonFor(`${item._id}:${status}`);
      setReason("");
      return;
    }
    if (status !== "approved" && !reason.trim())
      return setError("Enter a reason for the vendor.");
    try {
      await reviewVerification(item._id, status, reason);
      setItems((list) => list.filter((entry) => entry._id !== item._id));
      setReasonFor(null);
      setMessage("Review saved.");
    } catch (e) {
      setError(getApiError(e, "Review failed."));
    }
  };
  return (
    <section className="section-pad container-shell">
      <Toast
        message={error || message}
        type={error ? "error" : "success"}
        onClose={() => {
          setError("");
          setMessage("");
        }}
      />
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl font-extrabold">Vendor verification review</h1>
        <p className="mt-2 text-ink/50">
          Preview submitted documents and record an auditable decision.
        </p>
        {loading ? (
          <div className="mt-8">
            <LoadingSkeleton />
          </div>
        ) : !items.length ? (
          <div className="mt-8">
            <EmptyState
              title="No pending submissions"
              description="The verification queue is clear."
            />
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            {items.map((item) => (
              <div
                key={item._id}
                className="rounded-[1.75rem] border bg-white p-6 shadow-soft"
              >
                <div className="flex flex-wrap justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-extrabold">
                      {item.vendor?.businessName}
                    </h2>
                    <p className="text-sm text-ink/50">
                      {item.vendor?.userId?.name} · {item.vendor?.userId?.email}
                    </p>
                  </div>
                  <p className="text-sm text-ink/50">
                    Submitted {new Date(item.submittedAt).toLocaleString()}
                  </p>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(item.documents || {})
                    .filter(([, doc]) => doc)
                    .map(([type, doc]) => (
                      <a
                        key={type}
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group rounded-2xl border p-3 hover:border-plum/40"
                      >
                        {doc.mimeType?.startsWith("image/") ? (
                          <img
                            src={doc.url}
                            alt={LABELS[type]}
                            className="h-36 w-full rounded-xl object-cover"
                          />
                        ) : (
                          <div className="grid h-36 place-items-center rounded-xl bg-sand">
                            <FileText className="h-10 w-10 text-plum" />
                          </div>
                        )}
                        <p className="mt-2 flex items-center justify-between text-sm font-bold">
                          {LABELS[type]}
                          <ExternalLink className="h-4 w-4" />
                        </p>
                      </a>
                    ))}
                </div>
                {reasonFor?.startsWith(item._id) && (
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Explain what must be corrected"
                    className="field mt-5 min-h-24"
                  />
                )}
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button onClick={() => review(item, "approved")}>
                    <Check className="h-4 w-4" /> Approve
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => review(item, "needs_resubmission")}
                  >
                    <RefreshCw className="h-4 w-4" /> Request resubmission
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => review(item, "rejected")}
                  >
                    <X className="h-4 w-4" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
