import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, ShieldCheck, Upload } from "lucide-react";
import Button from "../components/Button";
import Card from "../components/Card";
import Toast from "../components/Toast";
import { getMyVerification, submitVerification } from "../services/verificationService";
import { getApiError } from "../utils/apiError";

const TYPES = [
  ["governmentId", "Government ID", true],
  ["businessLicense", "Business License", true],
  ["gstCertificate", "GST Certificate", false],
  ["panCard", "PAN Card", true],
  ["profilePhoto", "Profile Photo", true],
];
const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE = 5 * 1024 * 1024;

const labelStatus = (value) => ({ pending: "Pending", approved: "Approved", rejected: "Rejected", needs_resubmission: "Needs Resubmission" })[value] || "Not submitted";

export default function VendorVerificationPage() {
  const [verification, setVerification] = useState(null);
  const [files, setFiles] = useState({});
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { getMyVerification().then(setVerification).catch((e) => setError(getApiError(e, "Unable to load verification."))).finally(() => setBusy(false)); }, []);
  const complete = useMemo(() => TYPES.filter(([, , required]) => required).every(([key]) => files[key] || verification?.documents?.[key]), [files, verification]);
  const completedCount = TYPES.filter(([key, , required]) => !required || files[key] || verification?.documents?.[key]).length;

  const choose = (type, file) => {
    setError("");
    if (!file) return;
    if (!ALLOWED.has(file.type)) return setError("Only PDF, JPG, PNG, and WEBP files are allowed.");
    if (file.size > MAX_SIZE) return setError("Each file must be 5 MB or smaller.");
    if (Object.entries(files).some(([key, value]) => key !== type && value && value.name === file.name && value.size === file.size)) return setError("Choose a different file for each document type.");
    setFiles((current) => ({ ...current, [type]: file }));
  };

  const submit = async () => {
    if (!complete) return setError("Upload every required document before submitting.");
    setBusy(true); setError("");
    try { const result = await submitVerification(files); setVerification(result); setFiles({}); setMessage("Verification submitted for admin review."); }
    catch (e) { setError(getApiError(e, "Submission failed.")); }
    finally { setBusy(false); }
  };

  const locked = verification?.status === "approved" || verification?.status === "pending";
  return <section className="section-pad container-shell">
    <Toast message={error || message} type={error ? "error" : "success"} onClose={() => { setError(""); setMessage(""); }} />
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center gap-3"><ShieldCheck className="h-9 w-9 text-plum" /><div><h1 className="text-3xl font-extrabold">Vendor verification</h1><p className="text-ink/50">Securely submit your identity and business documents.</p></div></div>
      <Card className="mt-6 p-6">
        <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-bold text-ink/50">STATUS</p><p className="mt-1 text-xl font-extrabold">{labelStatus(verification?.status)}</p></div><span className="rounded-full bg-plum/10 px-4 py-2 text-sm font-bold text-plum">{completedCount}/{TYPES.length} complete</span></div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-sand"><div className="h-full bg-plum transition-all" style={{ width: `${completedCount / TYPES.length * 100}%` }} /></div>
        {verification?.reason && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">Review reason: {verification.reason}</p>}
      </Card>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {TYPES.map(([key, label, required]) => { const existing = verification?.documents?.[key]; const selected = files[key]; return <Card key={key} className="p-5">
          <div className="flex items-start justify-between"><div><p className="font-extrabold">{label}</p><p className="text-xs text-ink/45">{required ? "Required" : "Optional"} · PDF/JPG/PNG/WEBP · max 5 MB</p></div>{(existing || selected) && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}</div>
          {(selected || existing) && <p className="mt-3 truncate text-sm text-ink/60"><FileText className="mr-1 inline h-4 w-4" />{selected?.name || existing.originalName}</p>}
          {!locked && <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-plum/30 p-3 text-sm font-bold text-plum"><Upload className="h-4 w-4" />{existing ? "Replace" : "Choose file"}<input className="sr-only" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => choose(key, e.target.files?.[0])} /></label>}
        </Card>; })}
      </div>
      {!locked && <Button className="mt-6" disabled={!complete || busy || !Object.keys(files).length} loading={busy} onClick={submit}>Submit for review</Button>}
      {verification?.status === "pending" && <p className="mt-6 text-sm text-ink/50">Your submission is locked while an administrator reviews it.</p>}
    </div>
  </section>;
}
