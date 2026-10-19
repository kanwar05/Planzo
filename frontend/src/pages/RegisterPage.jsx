import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Button from "../components/Button";
import Toast from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { services } from "../data/services";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { getApiError } from "../utils/apiError";

export default function RegisterPage() {
  useDocumentTitle("Create account");
  const [params] = useSearchParams();
  const [tab, setTab] = useState(() => params.get("role") === "vendor" ? "vendor" : "customer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const submit = async (event) => {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError("");

    const form = new FormData(event.currentTarget);

    try {
      const user = await register({
        name: form.get("name"),
        email: form.get("email"),
        phone: form.get("phone"),
        password: form.get("password"),
        role: tab,
      });

      if (user.role === "vendor") {
        navigate("/vendor/profile-setup", {
          replace: true,
          state: {
            businessName: form.get("businessName"),
            serviceCategory: form.get("serviceCategory"),
          },
        });
      } else {
        navigate("/customer/dashboard", { replace: true });
      }
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to create your account."));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <Toast message={error} type="error" onClose={() => setError("")} />
      <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-coral">
        Join the community
      </p>
      <h1 className="mt-3 font-editorial text-4xl sm:text-5xl">Create your account.</h1>
      <p className="mt-3 text-sm leading-6 text-ink/65">Start planning something lovely, or help bring it to life.</p>
      <div role="group" aria-label="Account type" className="mt-7 grid grid-cols-2 rounded-2xl bg-sand p-1.5">
        {["customer", "vendor"].map((item) => (
          <button
            type="button"
            key={item}
            aria-pressed={tab === item}
            disabled={loading}
            onClick={() => setTab(item)}
            className={`min-h-12 rounded-xl px-2 py-2.5 text-[11px] font-bold capitalize transition sm:text-xs ${
              tab === item ? "bg-white text-ink shadow-sm" : "text-ink/65"
            }`}
          >
            {item} registration
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="mt-7 grid gap-4">
        <div className={tab === "vendor" ? "grid gap-4 sm:grid-cols-2" : ""}>
          <div>
            <label className="label" htmlFor="register-name">Full name</label>
            <input required name="name" id="register-name" autoComplete="name" className="field" placeholder="Your name" />
          </div>
          {tab === "vendor" && (
            <div>
              <label className="label" htmlFor="register-businessName">Business name</label>
              <input
                required
                name="businessName" id="register-businessName"
                className="field"
                placeholder="Studio or brand name"
              />
            </div>
          )}
        </div>
        <div>
          <label className="label" htmlFor="register-email">Email address</label>
          <input
            required
            name="email" id="register-email"
            type="email"
            autoComplete="email"
            className="field"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="label" htmlFor="register-phone">Phone number</label>
          <input
            required
            name="phone" id="register-phone"
            type="tel"
            autoComplete="tel"
            className="field"
            placeholder="+91 98765 43210"
          />
        </div>
        {tab === "vendor" && (
          <div>
            <label className="label" htmlFor="register-serviceCategory">Service category</label>
            <select name="serviceCategory" id="register-serviceCategory" className="field" required>
              <option value="">Select a service</option>
              {services.map((item) => (
                <option key={item.slug}>{item.title}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="register-password">Password</label>
          <input
            required
            name="password" id="register-password"
            type="password"
            autoComplete="new-password"
            minLength="8"
            className="field"
            placeholder="Uppercase, number, and symbol"
          />
        </div>
        <Button type="submit" loading={loading} disabled={loading} className="w-full">
          {tab === "vendor"
            ? "Create vendor account"
            : "Create customer account"}
        </Button>
      </form>
      <p className="mt-6 border-t border-ink/10 pt-6 text-center text-sm leading-7 text-ink/65">
        Already have an account?{" "}
        <Link to="/login" className="font-bold text-coral">
          Log in
        </Link>
      </p>
    </div>
  );
}
