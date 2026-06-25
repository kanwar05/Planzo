import { LockKeyhole } from "lucide-react";
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
  const token = params.get("token") || "";

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const form = new FormData(event.currentTarget);
      await resetPassword({
        token: form.get("token"),
        password: form.get("password"),
      });
      navigate("/login", { replace: true });
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to reset password."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <Toast message={error} type="error" onClose={() => setError("")} />
      <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-coral">
        Choose a new password
      </p>
      <h1 className="mt-3 text-4xl font-extrabold">Secure your account.</h1>
      <form onSubmit={submit} className="mt-9 space-y-5">
        <div>
          <label className="label">Reset token</label>
          <input
            required
            name="token"
            defaultValue={token}
            className="field"
            placeholder="Paste your reset token"
          />
        </div>
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
        <Button type="submit" loading={loading} disabled={loading} className="w-full">
          Reset password
        </Button>
      </form>
      <p className="mt-7 text-center text-sm text-ink/50">
        Back to{" "}
        <Link to="/login" className="font-bold text-coral">
          login
        </Link>
      </p>
    </div>
  );
}
