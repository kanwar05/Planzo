import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Toast from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { getApiError } from "../utils/apiError";

export default function LoginPage() {
  useDocumentTitle("Welcome back");
  const [method, setMethod] = useState("password");
  const [otpRequested, setOtpRequested] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const { login, requestLoginOtp, verifyLoginOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const submit = async (event) => {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError("");

    const form = new FormData(event.currentTarget);

    try {
      const email = String(form.get("email") || "").trim();
      const user = method === "password"
        ? await login({ email, password: form.get("password") })
        : await verifyLoginOtp({ email, code: String(form.get("code") || "").trim() });
      const defaultPath =
        user.role === "admin" ? "/admin" : user.role === "vendor" ? "/vendor/dashboard" : "/customer/dashboard";
      const requestedPath = location.state?.from?.pathname;
      navigate(requestedPath || defaultPath, { replace: true });
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to log in."));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  const requestOtp = async (event) => {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError("");
    const email = String(new FormData(event.currentTarget).get("email") || "").trim();
    try {
      await requestLoginOtp(email);
      setEmailInput(email);
      setOtpRequested(true);
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to send a sign-in code."));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <Toast message={error} type="error" onClose={() => setError("")} />
      {location.state?.message && <p role="status" className="mb-5 rounded-2xl bg-sage/70 p-4 text-sm leading-6 text-ink/75">{location.state.message}</p>}
      <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-coral">
        Good to see you
      </p>
      <h1 className="mt-3 font-editorial text-5xl">Welcome back.</h1>
      <p className="mt-3 text-sm leading-6 text-ink/65">
        Sign in to continue planning your next beautiful event.
      </p>
      <div className="mt-8 grid grid-cols-2 rounded-2xl bg-ink/5 p-1 text-sm font-bold">
        <button type="button" onClick={() => { setMethod("password"); setOtpRequested(false); setError(""); }} className={`rounded-xl px-3 py-3 ${method === "password" ? "bg-white shadow-sm" : "text-ink/60"}`}>Password</button>
        <button type="button" onClick={() => { setMethod("otp"); setError(""); }} className={`rounded-xl px-3 py-3 ${method === "otp" ? "bg-white shadow-sm" : "text-ink/60"}`}>Email code</button>
      </div>
      <form onSubmit={method === "otp" && !otpRequested ? requestOtp : submit} className="mt-5 space-y-5">
        <div>
          <label htmlFor="login-email" className="label">Email address</label>
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/65" />
            <input
              required
              name="email"
              id="login-email"
              autoComplete="email"
              type="email"
              readOnly={method === "otp" && otpRequested}
              value={emailInput}
              onChange={(event) => setEmailInput(event.target.value)}
              className="field !pl-11"
              placeholder="you@example.com"
            />
          </div>
        </div>
        {method === "password" && <div>
          <label htmlFor="login-password" className="label">Password</label>
          <div className="relative">
            <LockKeyhole className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/65" />
            <input
              required
              name="password"
              id="login-password"
              autoComplete="current-password"
              type={show ? "text" : "password"}
              className="field !px-11"
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              aria-label={show ? "Hide password" : "Show password"}
              aria-pressed={show}
              className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-ink/65"
            >
              {show ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>}
        {method === "otp" && otpRequested && <div>
          <label htmlFor="login-code" className="label">Six-digit code</label>
          <input required name="code" id="login-code" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" autoComplete="one-time-code" className="field tracking-[0.4em]" placeholder="000000" />
          <button type="button" onClick={() => setOtpRequested(false)} className="mt-2 text-xs font-bold text-coral">Use a different email</button>
        </div>}
        {method === "password" && <div className="flex items-center justify-between text-xs">
          <Link to="/forgot-password" className="inline-flex min-h-11 items-center font-bold text-coral">
            Forgot password?
          </Link>
        </div>}
        <Button type="submit" loading={loading} disabled={loading} className="w-full">
          {method === "otp" && !otpRequested ? "Send sign-in code" : "Log in"}
        </Button>
      </form>
      <p className="mt-7 border-t border-ink/10 pt-6 text-center text-sm leading-7 text-ink/65">
        New to Planzo?{" "}
        <Link to="/register" className="font-bold text-coral">
          Create an account
        </Link>
      </p>
    </div>
  );
}
