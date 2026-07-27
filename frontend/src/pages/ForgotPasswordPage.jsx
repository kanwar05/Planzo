import { CheckCircle2, Mail } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import Button from "../components/Button";
import Toast from "../components/Toast";
import { forgotPassword } from "../services/authService";
import { getApiError } from "../utils/apiError";

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [devToken, setDevToken] = useState("");
  const [sentTo, setSentTo] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    setDevToken("");

    try {
      const form = new FormData(event.currentTarget);
      const email = form.get("email");
      const response = await forgotPassword(email);
      setMessage(response.message);
      setSentTo(email);
      if (response.resetToken) setDevToken(response.resetToken);
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
      <h1 className="mt-3 text-4xl font-extrabold">{sentTo ? "Check your inbox." : "Reset your password."}</h1>
      {sentTo ? (
        <div className="mt-7 rounded-3xl border border-emerald-100 bg-emerald-50 p-6">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          <p className="mt-4 font-bold">If an account exists for {sentTo}, a secure link is on its way.</p>
          <p className="mt-2 text-sm leading-6 text-ink/55">It expires in 15 minutes and can only be used once. Check your spam folder if it does not arrive.</p>
          <Button type="button" variant="outline" className="mt-5" onClick={() => { setSentTo(""); setMessage(""); setDevToken(""); }}>
            Try another email
          </Button>
        </div>
      ) : (
      <>
        <p className="mt-3 text-sm text-ink/50">
          Enter your account email and we will send a secure, single-use reset link.
        </p>
        <form onSubmit={submit} className="mt-9 space-y-5">
        <div>
          <label className="label">Email address</label>
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
            <input
              required
              name="email"
              type="email"
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
      {devToken && (
        <div className="mt-5 rounded-2xl bg-sand p-4 text-xs font-semibold text-ink/60">
          Development only: <Link className="font-bold text-coral" to={`/reset-password?token=${encodeURIComponent(devToken)}`}>open reset page</Link>
        </div>
      )}
      <p className="mt-7 text-center text-sm text-ink/50">
        Remembered it?{" "}
        <Link to="/login" className="font-bold text-coral">
          Log in
        </Link>
      </p>
    </div>
  );
}
