import { Instagram, Linkedin, Mail, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import Logo from "./Logo";

export default function Footer() {
  return (
    <footer className="bg-ink text-white">
      <div className="container-shell grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <Logo light />
          <p className="mt-5 max-w-sm text-sm leading-7 text-white/55">Thoughtful vendors, transparent choices, and celebrations that feel unmistakably yours.</p>
          <div className="mt-6 flex gap-3">
            {[Instagram, Linkedin, Mail].map((Icon, index) => <a key={index} href="#" className="grid h-10 w-10 place-items-center rounded-full bg-white/8 text-white/70 transition hover:bg-coral hover:text-white"><Icon className="h-4 w-4" /></a>)}
          </div>
        </div>
        <div>
          <h3 className="font-bold">Explore</h3>
          <div className="mt-5 grid gap-3 text-sm text-white/55">
            <Link to="/vendors">Find vendors</Link><Link to="/services">Services</Link><Link to="/register">Become a partner</Link><Link to="/login">Sign in</Link>
          </div>
        </div>
        <div>
          <h3 className="font-bold">Contact</h3>
          <div className="mt-5 space-y-4 text-sm text-white/55">
            <p className="flex gap-2"><Mail className="h-4 w-4 shrink-0" /> hello@planzo.events</p>
            <p className="flex gap-2"><MapPin className="h-4 w-4 shrink-0" /> New Delhi, India</p>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10"><div className="container-shell flex flex-col gap-2 py-5 text-xs text-white/35 sm:flex-row sm:justify-between"><p>© 2026 PLANZO. All celebrations reserved.</p><p>Privacy · Terms · Safety</p></div></div>
    </footer>
  );
}
