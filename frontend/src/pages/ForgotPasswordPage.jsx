import { CheckCircle2, Mail } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import Button from "../components/Button";
import Toast from "../components/Toast";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { forgotPassword } from "../services/authService";
import { getApiError } from "../utils/apiError";

export default function ForgotPasswordPage() {
  useDocumentTitle("Reset your password");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const form = new FormData(event.currentTarget);
      const email = form.get("email");
      const response = await forgotPassword(email);
      setMessage(response.message);
      setSentTo(email);
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to start password reset."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <Toast
        message={error || message}
        type={error ? "error" : "success"}
        onClose={() => {
          setError("");
          setMessage("");
        }}
      />
      <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-coral">
        Account recovery
      </p>
      <h1 className="mt-3 font-editorial text-4xl sm:text-5xl">{sentTo ? "Check your inbox." : "Reset your password."}</h1>
      {sentTo ? (
        <div className="mt-7 rounded-2xl border border-ink/10 bg-sage/65 p-6">
          <CheckCircle2 className="h-10 w-10 text-[#356347]" />
          <p className="mt-4 font-bold">If an account exists for <span className="break-all">{sentTo}</span>, a secure link is on its way.</p>
          <p className="mt-2 text-sm leading-6 text-ink/65">It expires in 15 minutes and can only be used once. Check your spam folder if it does not arrive.</p>
          <Button type="button" variant="outline" className="mt-5" onClick={() => { setSentTo(""); setMessage(""); }}>
            Try another email
          </Button>
        </div>
      ) : (
      <>
        <p className="mt-3 text-sm leading-6 text-ink/65">
          Enter your account email and we will send a secure, single-use reset link.
        </p>
        <form onSubmit={submit} className="mt-9 space-y-5">
        <div>
          <label className="label" htmlFor="recovery-email">Email address</label>
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/65" />
            <input
              required
              name="email" id="recovery-email"
              type="email"
              autoComplete="email"
              className="field !pl-11"
              placeholder="you@example.com"
            />
          </div>
        </div>
        <Button type="submit" loading={loading} disabled={loading} className="w-full">
          Send reset instructions
        </Button>
        </form>
      </>
      )}
      <p className="mt-7 border-t border-ink/10 pt-6 text-center text-sm text-ink/65">
        Remembered it?{" "}
        <Link to="/login" className="font-bold text-coral">
          Log in
        </Link>
      </p>
    </div>
  );
}
