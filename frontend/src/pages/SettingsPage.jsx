import { LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const actionLock = useRef(false);
  const errorMessage = useRef(null);
  useEffect(() => {
    if (error) errorMessage.current?.focus();
  }, [error]);
  const run = async (name, action) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(name);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (err) {
      setError(getApiError(err, "Unable to update your account."));
    } finally {
      actionLock.current = false;
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
  return <div className="space-y-7 sm:space-y-9">
    <Toast message={message} onClose={() => setMessage("")} />
    <header>
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-coral">A space of your own</p>
      <h1 className="mt-3 font-editorial text-4xl sm:text-5xl">Account settings</h1>
      <p className="mt-3 text-sm leading-6 text-ink/65">Keep your details up to date and your account secure.</p>
    </header>
    {error && <p ref={errorMessage} tabIndex={-1} role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-700 focus:outline-none">
      {error}
    </p>}
    <div className="grid items-start gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">
    <aside className="min-w-0 rounded-2xl border border-ink/10 bg-white p-5 xl:sticky xl:top-28">
      <div className="flex items-center gap-3 xl:block"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-sage font-editorial text-2xl">{user?.name?.charAt(0)?.toUpperCase() || "P"}</span><div className="min-w-0 xl:mt-4"><p className="break-words text-sm font-bold">{user?.name}</p><p className="mt-1 text-xs capitalize text-ink/65">{user?.role} account</p></div></div>
      <nav aria-label="Account sections" className="mt-5 flex flex-wrap gap-1 border-t border-ink/10 pt-3 xl:flex-col"><a href="#profile-information" className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-semibold hover:bg-sand"><UserRound className="h-4 w-4" aria-hidden="true" />Profile</a><a href="#email-settings" className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-semibold hover:bg-sand"><Mail className="h-4 w-4" aria-hidden="true" />Email</a><a href="#password-settings" className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-semibold hover:bg-sand"><LockKeyhole className="h-4 w-4" aria-hidden="true" />Security</a></nav>
      <p className="mt-4 hidden text-xs leading-6 text-ink/65 xl:block"><ShieldCheck className="mb-2 h-5 w-5 text-coral" aria-hidden="true" />You control your personal details and who can access your account.</p>
    </aside>
    <div className="min-w-0 space-y-5">
    <section id="profile-information" aria-labelledby="profile-heading" className="scroll-mt-28"><Card className="!rounded-2xl p-5 !shadow-none sm:p-7">
      <h2 id="profile-heading" className="text-lg font-bold">Profile information</h2>
      <p className="mt-2 text-sm leading-6 text-ink/65">Your name and contact details, kept up to date.</p>
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
          <Button type="submit" className="w-full sm:w-auto" disabled={Boolean(busy)} loading={busy === "profile"}>Save profile</Button>
        </div>
      </form>
    </Card></section>
    <section id="email-settings" aria-labelledby="email-heading" className="scroll-mt-28"><Card className="!rounded-2xl p-5 !shadow-none sm:p-7">
      <h2 id="email-heading" className="text-lg font-bold">Change email</h2>
      <p className="mt-2 text-sm leading-6 text-ink/65">Verify your new address before it replaces your current email. Verification signs out your existing sessions.</p>
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
          <Button type="submit" className="w-full sm:w-auto" disabled={Boolean(busy)} loading={busy === "email"}>Send verification link</Button>
        </div>
      </form>
    </Card></section>
    <section id="password-settings" aria-labelledby="password-heading" className="scroll-mt-28"><Card className="!rounded-2xl p-5 !shadow-none sm:p-7">
      <h2 id="password-heading" className="text-lg font-bold">Change password</h2>
      <p className="mt-2 text-sm leading-6 text-ink/65">Use at least 8 characters including an uppercase letter, number, and symbol. You will be asked to sign in again.</p>
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
          <Button type="submit" className="w-full sm:w-auto" disabled={Boolean(busy)} loading={busy === "password"}>Update password</Button>
        </div>
      </form>
    </Card></section>
    {user?.role !== "admin" && <Card className="!rounded-2xl !border-red-200/70 !bg-[#FFFDFC] p-5 !shadow-none sm:p-7">
      <h2 className="text-lg font-bold">Deactivate account</h2>
      <p className="mt-2 text-sm leading-6 text-ink/65">This disables access to your account and hides your business profile if you have one. Booking history is retained. Resolve pending or accepted bookings before continuing.</p>
      <form onSubmit={deactivate} className="mt-5 space-y-5">
        <label className="block">
          <span className="label">Password to deactivate account</span>
          <input required name="password" type="password" autoComplete="current-password" className="field" />
        </label>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6 text-ink/70"><input required type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-coral" />I understand that my account will be deactivated.</label>
        <Button type="submit" variant="outline" className="w-full !text-red-800 sm:w-auto" disabled={Boolean(busy)} loading={busy === "deactivate"}>Deactivate account</Button>
      </form>
    </Card>}
    </div>
    </div>
  </div>;
}
