import {
  Bell, ChevronRight, Laptop, LockKeyhole, Mail, MessageSquare,
  MonitorCog, Palette, Shield, Smartphone, Trash2, UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Toast from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { changePassword, updateProfile } from "../services/authService";
import {
  deactivateAccount, deleteAccount, getSessions, getSettings,
  revokeOtherSessions, revokeSession, updateSettings,
} from "../services/settingsService";
import { getApiError } from "../utils/apiError";

const tabs = [
  ["profile", "Profile", UserRound],
  ["security", "Password & security", LockKeyhole],
  ["notifications", "Notifications", Bell],
  ["email", "Email preferences", Mail],
  ["sms", "SMS preferences", MessageSquare],
  ["privacy", "Privacy", Shield],
  ["appearance", "Appearance", Palette],
  ["sessions", "Devices & sessions", MonitorCog],
  ["account", "Account status", Trash2],
];

const Toggle = ({ label, description, checked, onChange }) => (
  <label className="flex cursor-pointer items-center justify-between gap-6 rounded-2xl border border-ink/8 bg-white p-4">
    <span>
      <span className="block text-sm font-bold">{label}</span>
      {description && <span className="mt-1 block text-xs leading-5 text-ink/45">{description}</span>}
    </span>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
      className="h-5 w-5 shrink-0 accent-coral" />
  </label>
);

const Panel = ({ title, intro, children }) => (
  <section>
    <h2 className="text-2xl font-extrabold">{title}</h2>
    {intro && <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/50">{intro}</p>}
    <div className="mt-7">{children}</div>
  </section>
);

export default function SettingsPage() {
  useDocumentTitle("Account Settings - Planzo");
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [tab, setTab] = useState("profile");
  const [settings, setSettings] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [profile, setProfile] = useState({ name: user?.name || "", email: user?.email || "", phone: user?.phone || "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [toast, setToast] = useState({ message: "", type: "success" });

  const notify = (message, type = "success") => setToast({ message, type });
  const fail = (error, fallback) => notify(getApiError(error, fallback), "error");

  useEffect(() => {
    Promise.all([getSettings(), getSessions()])
      .then(([nextSettings, nextSessions]) => {
        setSettings(nextSettings);
        setSessions(nextSessions);
        const mode = nextSettings.theme.mode;
        document.documentElement.dataset.theme = mode;
        document.documentElement.classList.toggle("reduce-motion", nextSettings.theme.reducedMotion);
      })
      .catch((error) => fail(error, "Unable to load account settings."))
      .finally(() => setLoading(false));
  }, []);

  const saveProfile = async (event) => {
    event.preventDefault();
    if (profile.name.trim().length < 2) return notify("Name must contain at least 2 characters.", "error");
    if (!/^\S+@\S+\.\S+$/.test(profile.email)) return notify("Enter a valid email address.", "error");
    if (profile.phone.trim().length < 7) return notify("Enter a valid phone number.", "error");
    setSaving("profile");
    try {
      const nextUser = await updateProfile(profile);
      updateUser(nextUser);
      notify("Profile updated.");
    } catch (error) { fail(error, "Unable to update profile."); }
    finally { setSaving(""); }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentPassword = form.get("currentPassword");
    const newPassword = form.get("newPassword");
    const confirmation = form.get("confirmation");
    if (newPassword !== confirmation) return notify("New passwords do not match.", "error");
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword))
      return notify("Use 8+ characters with an uppercase letter, number, and symbol.", "error");
    setSaving("password");
    try {
      await changePassword({ currentPassword, newPassword });
      updateUser(null);
      navigate("/login", { replace: true });
    } catch (error) { fail(error, "Unable to change password."); }
    finally { setSaving(""); }
  };

  const patch = async (section, field, value) => {
    const previous = settings;
    const next = { ...settings, [section]: { ...settings[section], [field]: value } };
    setSettings(next);
    setSaving(section);
    try {
      const saved = await updateSettings({ [section]: { [field]: value } });
      setSettings(saved);
      if (section === "theme") {
        document.documentElement.dataset.theme = saved.theme.mode;
        document.documentElement.classList.toggle("reduce-motion", saved.theme.reducedMotion);
      }
      notify("Preference saved.");
    } catch (error) {
      setSettings(previous);
      fail(error, "Unable to save preference.");
    } finally { setSaving(""); }
  };

  const endSession = async (session) => {
    setSaving(session.id);
    try {
      await revokeSession(session.id);
      if (session.current) {
        updateUser(null);
        return navigate("/login", { replace: true });
      }
      setSessions((items) => items.filter((item) => item.id !== session.id));
      notify("Device signed out.");
    } catch (error) { fail(error, "Unable to end session."); }
    finally { setSaving(""); }
  };

  const endOthers = async () => {
    setSaving("others");
    try {
      await revokeOtherSessions();
      setSessions((items) => items.filter((item) => item.current));
      notify("All other devices signed out.");
    } catch (error) { fail(error, "Unable to end other sessions."); }
    finally { setSaving(""); }
  };

  const closeAccount = async (event, action) => {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    const verb = action === "delete" ? "permanently delete" : "deactivate";
    if (!window.confirm(`Are you sure you want to ${verb} your account?`)) return;
    setSaving(action);
    try {
      await (action === "delete" ? deleteAccount(password) : deactivateAccount(password));
      updateUser(null);
      navigate("/login", { replace: true });
    } catch (error) { fail(error, `Unable to ${action} account.`); }
    finally { setSaving(""); }
  };

  if (loading) return <div className="space-y-4 p-8"><LoadingSkeleton className="h-16" /><LoadingSkeleton className="h-96" /></div>;

  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
      <Toast {...toast} onClose={() => setToast({ message: "", type: "success" })} />
      <header className="mb-8">
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-coral">Your account</p>
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Settings</h1>
        <p className="mt-2 text-sm text-ink/50">Manage your profile, communication, privacy, and account security.</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <nav className="h-fit rounded-3xl border border-ink/8 bg-white p-3 shadow-soft" aria-label="Settings">
          {tabs.map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold transition ${tab === id ? "bg-ink text-white" : "text-ink/55 hover:bg-ink/5 hover:text-ink"}`}>
              <Icon className="h-4 w-4" /><span className="flex-1">{label}</span><ChevronRight className="h-4 w-4 opacity-40" />
            </button>
          ))}
        </nav>
        <main className="min-h-[580px] rounded-3xl border border-ink/8 bg-white p-6 shadow-soft sm:p-8">
          {tab === "profile" && <Panel title="Profile information" intro="Keep your contact information accurate for bookings and account recovery.">
            <form onSubmit={saveProfile} className="max-w-xl space-y-5">
              {[["name","Full name","text"],["email","Email address","email"],["phone","Phone number","tel"]].map(([key,label,type]) => <label key={key} className="block"><span className="label">{label}</span><input className="field" type={type} required value={profile[key]} onChange={(e) => setProfile((p) => ({...p,[key]:e.target.value}))} /></label>)}
              <Button loading={saving === "profile"} disabled={Boolean(saving)}>Save profile</Button>
            </form>
          </Panel>}
          {tab === "security" && <Panel title="Change password" intro="Changing your password signs you out on every device.">
            <form onSubmit={savePassword} className="max-w-xl space-y-5">
              <label className="block"><span className="label">Current password</span><input className="field" name="currentPassword" type="password" required /></label>
              <label className="block"><span className="label">New password</span><input className="field" name="newPassword" type="password" required minLength="8" /></label>
              <label className="block"><span className="label">Confirm new password</span><input className="field" name="confirmation" type="password" required minLength="8" /></label>
              <Button loading={saving === "password"} disabled={Boolean(saving)}>Update password</Button>
            </form>
          </Panel>}
          {tab === "notifications" && <PreferencePanel title="Notification preferences" section="notifications" values={settings.notifications} patch={patch} items={[["bookingUpdates","Booking updates"],["reviewReminders","Review reminders"],["promotions","Offers and promotions"],["productUpdates","Product updates"]]} />}
          {tab === "email" && <PreferencePanel title="Email preferences" section="email" values={settings.email} patch={patch} items={[["enabled","Email notifications"],["bookingUpdates","Booking emails"],["promotions","Promotional emails"],["newsletter","Planzo newsletter"]]} />}
          {tab === "sms" && <PreferencePanel title="SMS preferences" section="sms" values={settings.sms} patch={patch} items={[["enabled","SMS notifications"],["bookingUpdates","Booking texts"],["securityAlerts","Security alerts"],["promotions","Promotional texts"]]} />}
          {tab === "privacy" && <Panel title="Privacy settings" intro="Control who can discover your profile and how Planzo uses your activity.">
            <div className="max-w-xl space-y-3">
              <label className="block"><span className="label">Profile visibility</span><select className="field" value={settings.privacy.profileVisibility} onChange={(e) => patch("privacy","profileVisibility",e.target.value)}><option value="public">Public</option><option value="members">Planzo members</option><option value="private">Private</option></select></label>
              {[["showOnlineStatus","Show online status"],["allowSearchEngines","Allow search engines"],["dataPersonalization","Personalized recommendations"]].map(([key,label]) => <Toggle key={key} label={label} checked={settings.privacy[key]} onChange={(v) => patch("privacy",key,v)} />)}
            </div>
          </Panel>}
          {tab === "appearance" && <Panel title="Theme settings" intro="Choose how Planzo looks on this device and reduce animation if preferred.">
            <div className="max-w-xl space-y-5"><label className="block"><span className="label">Color theme</span><select className="field" value={settings.theme.mode} onChange={(e) => patch("theme","mode",e.target.value)}><option value="system">Use system setting</option><option value="light">Light</option><option value="dark">Dark</option></select></label><Toggle label="Reduce motion" checked={settings.theme.reducedMotion} onChange={(v) => patch("theme","reducedMotion",v)} /></div>
          </Panel>}
          {tab === "sessions" && <Panel title="Connected devices" intro="Review active sessions and sign out devices you no longer recognize.">
            <div className="space-y-3">{sessions.map((session) => <div key={session.id} className="flex items-center gap-4 rounded-2xl border border-ink/8 p-4">{session.device.type.includes("Mobile") ? <Smartphone className="h-6 w-6 text-coral" /> : <Laptop className="h-6 w-6 text-coral" />}<div className="min-w-0 flex-1"><p className="font-bold">{session.device.type} · {session.device.browser} {session.current && <span className="ml-2 text-xs text-emerald-600">This device</span>}</p><p className="mt-1 text-xs text-ink/45">Last active {new Date(session.lastUsedAt).toLocaleString()} · {session.device.ip}</p></div><Button variant="ghost" loading={saving === session.id} onClick={() => endSession(session)}>Sign out</Button></div>)}</div>
            {sessions.length > 1 && <Button variant="outline" className="mt-5" loading={saving === "others"} onClick={endOthers}>Sign out other devices</Button>}
          </Panel>}
          {tab === "account" && <Panel title="Account status" intro="Deactivation is reversible through support. Deletion permanently removes your account data.">
            <div className="grid gap-5 xl:grid-cols-2"><DangerForm title="Deactivate account" text="Your profile becomes unavailable and every session is signed out." action="Deactivate" loading={saving === "deactivate"} onSubmit={(e) => closeAccount(e,"deactivate")} /><DangerForm title="Delete account" text="Permanently delete your account after active bookings are resolved." action="Delete permanently" loading={saving === "delete"} onSubmit={(e) => closeAccount(e,"delete")} /></div>
          </Panel>}
        </main>
      </div>
    </div>
  );
}

function PreferencePanel({ title, section, values, patch, items }) {
  return <Panel title={title} intro="Choose the updates you want to receive."><div className="max-w-xl space-y-3">{items.map(([key,label]) => <Toggle key={key} label={label} checked={values[key]} onChange={(value) => patch(section,key,value)} />)}</div></Panel>;
}

function DangerForm({ title, text, action, loading, onSubmit }) {
  return <form onSubmit={onSubmit} className="rounded-3xl border border-red-200 bg-red-50/60 p-5"><h3 className="text-lg font-extrabold text-red-700">{title}</h3><p className="mt-2 text-sm leading-6 text-ink/55">{text}</p><label className="mt-5 block"><span className="label">Confirm password</span><input className="field" name="password" type="password" required /></label><Button type="submit" variant="outline" loading={loading} className="mt-4 !border-red-300 !text-red-700">{action}</Button></form>;
}
