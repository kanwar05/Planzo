import { Mail } from "lucide-react";
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

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    setDevToken("");

    try {
      const form = new FormData(event.currentTarget);
      const response = await forgotPassword(form.get("email"));
      setMessage(response.message);
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
      <h1 className="mt-3 text-4xl font-extrabold">Reset your password.</h1>
      <p className="mt-3 text-sm text-ink/50">
        Enter your account email and we will create a secure reset link.
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
      {devToken && (
        <div className="mt-5 rounded-2xl bg-sand p-4 text-xs font-semibold text-ink/60">
          Development reset token: {devToken}
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
