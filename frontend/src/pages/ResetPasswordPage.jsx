import { CheckCircle2, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Button from "../components/Button";
import Toast from "../components/Toast";
import { resetPassword } from "../services/authService";
import { getApiError } from "../utils/apiError";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const token = params.get("token") || "";

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const form = new FormData(event.currentTarget);
      if (form.get("password") !== form.get("confirmPassword")) {
        setError("Passwords do not match.");
        return;
      }
      await resetPassword({
        token,
        password: form.get("password"),
      });
      setSuccess(true);
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to reset password."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <Toast message={error} type="error" onClose={() => setError("")} />
      {success ? (
        <div className="text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-8 w-8" /></span>
          <h1 className="mt-5 text-4xl font-extrabold">Password changed.</h1>
          <p className="mt-3 text-sm leading-6 text-ink/50">Your password was updated and existing sessions were signed out. We also sent you a confirmation.</p>
          <Button className="mt-7 w-full" onClick={() => navigate("/login", { replace: true })}>Continue to login</Button>
        </div>
      ) : (
      <>
      <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-coral">
        Choose a new password
      </p>
      <h1 className="mt-3 text-4xl font-extrabold">Secure your account.</h1>
      {!token ? (
        <div className="mt-7 rounded-2xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">
          This reset link is incomplete. Request a new password reset email.
        </div>
      ) : (
      <form onSubmit={submit} className="mt-9 space-y-5">
        <div>
          <label className="label">New password</label>
          <div className="relative">
            <LockKeyhole className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
            <input
              required
              name="password"
              type="password"
              minLength="8"
              className="field !pl-11"
              placeholder="Use uppercase, number, and symbol"
            />
          </div>
        </div>
        <div>
          <label className="label">Confirm new password</label>
          <div className="relative">
            <LockKeyhole className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
            <input required name="confirmPassword" type="password" minLength="8" className="field !pl-11" placeholder="Enter it again" />
          </div>
        </div>
        <Button type="submit" loading={loading} disabled={loading} className="w-full">
          Reset password
        </Button>
      </form>
      )}
      <p className="mt-7 text-center text-sm text-ink/50">
        Back to{" "}
        <Link to="/login" className="font-bold text-coral">
          login
        </Link>
      </p>
      </>
      )}
    </div>
  );
}
