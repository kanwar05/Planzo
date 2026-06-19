import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Toast from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { getApiError } from "../utils/apiError";

export default function LoginPage() {
  useDocumentTitle("Welcome back");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(event.currentTarget);

    try {
      const user = await login({
        email: form.get("email"),
        password: form.get("password"),
      });
      const defaultPath =
        user.role === "vendor" ? "/vendor/dashboard" : "/customer/dashboard";
      const requestedPath = location.state?.from?.pathname;
      navigate(requestedPath || defaultPath, { replace: true });
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to log in."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <Toast message={error} type="error" onClose={() => setError("")} />
      <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-coral">
        Good to see you
      </p>
      <h1 className="mt-3 text-4xl font-extrabold">Welcome back.</h1>
      <p className="mt-3 text-sm text-ink/50">
        Sign in to continue planning your next beautiful event.
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
        <div>
          <label className="label">Password</label>
          <div className="relative">
            <LockKeyhole className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
            <input
              required
              name="password"
              type={show ? "text" : "password"}
              className="field !px-11"
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-ink/40"
            >
              {show ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs">
          <label className="flex items-center gap-2 font-semibold text-ink/60">
            <input type="checkbox" className="accent-coral" /> Remember me
          </label>
          <span className="font-bold text-ink/35">Forgot password?</span>
        </div>
        <Button type="submit" loading={loading} disabled={loading} className="w-full">
          Log in
        </Button>
      </form>
      <p className="mt-7 text-center text-sm text-ink/50">
        New to PLANZO?{" "}
        <Link to="/register" className="font-bold text-coral">
          Create an account
        </Link>
      </p>
    </div>
  );
}
