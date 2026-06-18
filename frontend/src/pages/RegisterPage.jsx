import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Button from "../components/Button";
import { services } from "../data/services";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export default function RegisterPage() {
  useDocumentTitle("Create account");
  const [tab, setTab] = useState("customer");
  const navigate = useNavigate();
  const submit = (event) => { event.preventDefault(); localStorage.setItem("planzo_demo_auth", "true"); navigate(tab === "vendor" ? "/vendor/profile" : "/dashboard"); };
  return (
    <div className="w-full">
      <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-coral">Join the community</p><h1 className="mt-3 text-4xl font-extrabold">Create your account.</h1>
      <div className="mt-7 grid grid-cols-2 rounded-full bg-sand/70 p-1.5">{["customer", "vendor"].map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-full px-4 py-2.5 text-xs font-bold capitalize transition ${tab === item ? "bg-white text-ink shadow-sm" : "text-ink/45"}`}>{item} registration</button>)}</div>
      <form onSubmit={submit} className="mt-7 grid gap-4">
        <div className={tab === "vendor" ? "grid gap-4 sm:grid-cols-2" : ""}><div><label className="label">Full name</label><input required className="field" placeholder="Your name" /></div>{tab === "vendor" && <div><label className="label">Business name</label><input required className="field" placeholder="Studio or brand name" /></div>}</div>
        <div><label className="label">Email address</label><input required type="email" className="field" placeholder="you@example.com" /></div>
        <div><label className="label">Phone number</label><input required type="tel" className="field" placeholder="+91 98765 43210" /></div>
        {tab === "vendor" && <div><label className="label">Service category</label><select className="field" required><option value="">Select a service</option>{services.map((item) => <option key={item.slug}>{item.title}</option>)}</select></div>}
        <div><label className="label">Password</label><input required type="password" minLength="6" className="field" placeholder="At least 6 characters" /></div>
        <label className="flex items-start gap-2 text-xs leading-5 text-ink/50"><input required type="checkbox" className="mt-1 accent-coral" /> I agree to PLANZO’s Terms of Service and Privacy Policy.</label>
        <Button type="submit" className="w-full">{tab === "vendor" ? "Create vendor account" : "Create customer account"}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink/50">Already have an account? <Link to="/login" className="font-bold text-coral">Log in</Link></p>
    </div>
  );
}
