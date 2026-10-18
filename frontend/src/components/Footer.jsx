import { Mail, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import Logo from "./Logo";
export default function Footer() {
  return <footer className="bg-ink text-white">
    <div className="container-shell grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-4">
      <div className="lg:col-span-2">
        <Logo light />
        <p className="mt-5 max-w-sm text-sm leading-7 text-white/55">Thoughtful vendors, transparent choices, and celebrations that feel unmistakably yours.</p>
      </div>
      <div>
        <h3 className="font-bold">Explore</h3>
        <div className="mt-5 grid gap-3 text-sm text-white/55">
          <Link to="/vendors">Find vendors</Link>
          <Link to="/services">Services</Link>
          <Link to="/register">Become a partner</Link>
          <Link to="/login">Sign in</Link>
        </div>
      </div>
      <div>
        <h3 className="font-bold">Contact</h3>
        <div className="mt-5 space-y-4 text-sm text-white/55">
          <a href="mailto:Planzo.event@gmail.com" className="flex items-center gap-2 break-all"><Mail className="h-4 w-4 shrink-0" />Planzo.event@gmail.com</a>
          <p className="flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0" />Chandigarh, India</p>
        </div>
      </div>
    </div>
    <div className="border-t border-white/10">
      <p className="container-shell py-5 text-xs text-white/35">© {new Date().getFullYear()} Planzo. All celebrations reserved.</p>
    </div>
  </footer>;
}
