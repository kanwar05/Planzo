import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Button from "../components/Button";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { confirmEmailChange } from "../services/authService";
import { getApiError } from "../utils/apiError";
export default function VerifyEmailPage() {
  useDocumentTitle("Verify email");
  const [params] = useSearchParams();
  const token = params.get("token");
  const {
    updateUser
  } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      await confirmEmailChange(token);
      updateUser(null);
      setSuccess(true);
      navigate("/verify-email", {
        replace: true
      });
    } catch (err) {
      setError(getApiError(err, "This link is invalid or has expired."));
    } finally {
      setBusy(false);
    }
  };
  return <div className="w-full">
    <p className="text-xs font-bold uppercase tracking-wider text-coral">Account security</p>
    <h1 className="mt-3 text-4xl font-extrabold">
      {success ? "Email updated." : "Verify your email."}
    </h1>
    <p className="mt-5 text-sm leading-7 text-ink/55">
      {success ? "Sign in with your new email address. Your existing sessions have been signed out." : token ? "Confirm this change to start using your new email address." : "Open the verification link sent to your new email address. If it has expired, request another link from account settings."}
    </p>
    {error && <p role="alert" className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
      {error}
    </p>}
    {success ? <Button to="/login" className="mt-7">Continue to login</Button> : token ? <Button disabled={busy} loading={busy} onClick={confirm} className="mt-7">Verify new email</Button> : <Button to="/login" variant="outline" className="mt-7">Log in</Button>}
  </div>;
}
