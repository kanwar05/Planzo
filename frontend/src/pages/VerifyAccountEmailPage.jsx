import { useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import Button from "../components/Button";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { requestEmailVerification, verifyInitialEmail } from "../services/authService";
import { getApiError } from "../utils/apiError";
import { getDashboardPath, getPackageIntent, getSafeReturnPath } from "../utils/navigation";

export default function VerifyAccountEmailPage() {
  useDocumentTitle("Verify your email");
  const { user, updateUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const destination = getSafeReturnPath(location.state?.from?.pathname, getDashboardPath(user?.role));
  const draft = location.state?.destinationState;
  const destinationState = destination === "/vendor/profile-setup" && draft ? {
    businessName: typeof draft.businessName === "string" ? draft.businessName : "",
    serviceCategory: typeof draft.serviceCategory === "string" ? draft.serviceCategory : "",
  } : getPackageIntent(draft?.packageId || location.state?.packageId || location.state?.from?.state?.packageId);
  if (user?.emailVerified === true || user?.role === "admin") {
    return <Navigate to={destination} state={destinationState} replace />;
  }
  const perform = async (verify) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(""); setMessage("");
    try {
      if (verify) {
        const next = await verifyInitialEmail(code);
        updateUser(next);
        navigate(destination, { replace: true, state: destinationState });
      } else {
        const response = await requestEmailVerification();
        setMessage(response.message || "A verification code has been sent. Check your email.");
      }
    } catch (err) {
      setError(getApiError(err, "Unable to verify your email. Please try again."));
    } finally {
      inFlight.current = false; setBusy(false);
    }
  };
  return <div className="w-full">
    <p className="eyebrow">One more step</p>
    <h1 className="mt-3 font-editorial text-4xl">Verify your email.</h1>
    <p className="mt-4 text-sm leading-7 text-ink/70">Verify {user?.email || "your account email"} before sending booking requests or managing your vendor business. Your account and booking history remain available.</p>
    {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="mt-5 rounded-xl bg-sage p-4 text-sm">{message}</p>}
    <Button type="button" className="mt-6" variant="outline" disabled={busy} onClick={() => perform(false)}>Send verification code</Button>
    <form className="mt-6 space-y-5" onSubmit={event => { event.preventDefault(); perform(true); }}>
      <label className="block"><span className="label">Six-digit verification code</span><input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value)} disabled={busy} className="field" /></label>
      <Button type="submit" disabled={busy || !/^\d{6}$/.test(code)} loading={busy}>Verify email and continue</Button>
    </form>
    <Button to={getDashboardPath(user?.role)} variant="ghost" className="mt-5">Return to my account</Button>
  </div>;
}
