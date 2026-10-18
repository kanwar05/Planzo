import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Card from "../components/Card";
import Toast from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { changePassword, deactivateAccount, requestEmailChange, updateProfile } from "../services/authService";
import { getApiError } from "../utils/apiError";
export default function SettingsPage() {
  useDocumentTitle("Account settings");
  const {
    user,
    updateUser
  } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState({
    name: user?.name || "",
    phone: user?.phone || ""
  });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const run = async (name, action) => {
    setBusy(name);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (err) {
      setError(getApiError(err, "Unable to update your account."));
    } finally {
      setBusy("");
    }
  };
  const saveProfile = event => {
    event.preventDefault();
    run("profile", async () => {
      if (profile.name.trim().length < 2) throw new Error("Name must contain at least 2 characters.");
      const saved = await updateProfile({
        name: profile.name.trim(),
        phone: profile.phone.trim()
      });
      updateUser(saved);
      setMessage("Profile saved.");
    });
  };
  const changeEmail = event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    run("email", async () => {
      const response = await requestEmailChange({
        email: data.get("email"),
        currentPassword: data.get("currentPassword")
      });
      form.reset();
      setMessage(response.message || "Check your new email for a verification link. Your current email remains active until verified.");
    });
  };
  const password = event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    run("password", async () => {
      if (data.get("newPassword") !== data.get("confirmation")) throw new Error("New passwords do not match.");
      await changePassword({
        currentPassword: data.get("currentPassword"),
        newPassword: data.get("newPassword")
      });
      updateUser(null);
      navigate("/login", {
        replace: true,
        state: {
          message: "Password updated. Log in with your new password."
        }
      });
    });
  };
  const deactivate = event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    run("deactivate", async () => {
      await deactivateAccount(data.get("password"));
      updateUser(null);
      navigate("/login", {
        replace: true,
        state: {
          message: "Your account has been deactivated."
        }
      });
    });
  };
  return <div className="space-y-7">
    <Toast message={message} onClose={() => setMessage("")} />
    <header>
      <p className="text-xs font-bold uppercase tracking-wider text-coral">Your account</p>
      <h1 className="mt-2 text-3xl font-extrabold">Account settings</h1>
    </header>
    {error && <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">
      {error}
    </p>}
    <Card className="p-6 sm:p-8">
      <h2 className="text-xl font-extrabold">Profile information</h2>
      <form onSubmit={saveProfile} className="mt-5 grid gap-5 sm:grid-cols-2">
        <label>
          <span className="label">Full name</span>
          <input required className="field" maxLength={80} value={profile.name} onChange={event => setProfile(current => ({
            ...current,
            name: event.target.value
          }))} autoComplete="name" />
        </label>
        <label>
          <span className="label">Phone number</span>
          <input type="tel" className="field" maxLength={20} value={profile.phone} onChange={event => setProfile(current => ({
            ...current,
            phone: event.target.value
          }))} autoComplete="tel" />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Current email</span>
          <input readOnly value={user?.email || ""} className="field bg-sand/30" type="email" />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={Boolean(busy)} loading={busy === "profile"}>Save profile</Button>
        </div>
      </form>
    </Card>
    <Card className="p-6 sm:p-8">
      <h2 className="text-xl font-extrabold">Change email</h2>
      <p className="mt-2 text-sm leading-6 text-ink/55">Verify your new address before it replaces your current email. Verification signs out your existing sessions.</p>
      <form onSubmit={changeEmail} className="mt-5 grid gap-5 sm:grid-cols-2">
        <label>
          <span className="label">New email address</span>
          <input required name="email" type="email" maxLength={254} className="field" autoComplete="email" />
        </label>
        <label>
          <span className="label">Current password for email change</span>
          <input required name="currentPassword" type="password" className="field" autoComplete="current-password" />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={Boolean(busy)} loading={busy === "email"}>Send verification link</Button>
        </div>
      </form>
    </Card>
    <Card className="p-6 sm:p-8">
      <h2 className="text-xl font-extrabold">Change password</h2>
      <p className="mt-2 text-sm leading-6 text-ink/55">Use at least 8 characters including an uppercase letter, number, and symbol. You will be asked to sign in again.</p>
      <form onSubmit={password} className="mt-5 grid gap-5 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="label">Current password</span>
          <input required name="currentPassword" type="password" className="field" autoComplete="current-password" />
        </label>
        <label>
          <span className="label">New password</span>
          <input required name="newPassword" type="password" minLength={8} className="field" autoComplete="new-password" />
        </label>
        <label>
          <span className="label">Confirm new password</span>
          <input required name="confirmation" type="password" minLength={8} className="field" autoComplete="new-password" />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={Boolean(busy)} loading={busy === "password"}>Update password</Button>
        </div>
      </form>
    </Card>
    {user?.role !== "admin" && <Card className="p-6 sm:p-8">
      <h2 className="text-xl font-extrabold">Deactivate account</h2>
      <p className="mt-2 text-sm leading-6 text-ink/55">This disables access to your account and hides your business profile if you have one. Booking history is retained. Resolve pending or accepted bookings before continuing.</p>
      <form onSubmit={deactivate} className="mt-5 space-y-5">
        <label className="block">
          <span className="label">Password to deactivate account</span>
          <input required name="password" type="password" autoComplete="current-password" className="field" />
        </label>
        <label className="flex items-start gap-3 text-sm text-ink/65"><input required type="checkbox" className="mt-1 accent-coral" />I understand that my account will be deactivated.</label>
        <Button type="submit" variant="outline" disabled={Boolean(busy)} loading={busy === "deactivate"}>Deactivate account</Button>
      </form>
    </Card>}
  </div>;
}
