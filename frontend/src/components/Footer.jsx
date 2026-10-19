import { ArrowRight, ArrowUpRight, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import Logo from "./Logo";
export default function Footer() {
  return <footer className="border-t bg-[#f1ede6]">
    <div className="container-shell grid gap-9 py-12 md:grid-cols-[1.4fr_1fr_1fr] md:py-16">
      <div><Logo /><p className="mt-4 max-w-xs text-sm leading-7 text-ink/65">Good people. Thoughtful details.<br />Celebrations that feel like you.</p><a href="mailto:Planzo.event@gmail.com" className="mt-5 inline-flex min-h-11 items-center gap-2 text-xs font-semibold"><Mail className="h-4 w-4 text-coral" />Let’s talk celebrations <ArrowUpRight className="h-3 w-3" /></a></div>
      <div><h3 className="eyebrow !text-ink/65">Find your people</h3><div className="mt-4 grid gap-1 text-sm"><Link className="py-2 hover:text-coral" to="/vendors">Explore vendors</Link><Link className="py-2 hover:text-coral" to="/services">Browse services</Link><Link className="py-2 hover:text-coral" to="/customer/dashboard">My bookings</Link></div></div>
      <div><h3 className="eyebrow !text-ink/65">Made for professionals</h3><p className="mt-5 max-w-xs text-sm leading-6 text-ink/65">Bring your craft to someone’s next big moment.</p><Link to="/register?role=vendor" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-coral">Become a Planzo partner <ArrowRight className="h-4 w-4" /></Link></div>
    </div>
    <div className="container-shell flex flex-wrap items-center justify-between gap-3 border-t py-6 text-[11px] text-ink/65"><p>© {new Date().getFullYear()} Planzo. Made for memorable moments.</p><p>Plan a little. Celebrate a lot.</p></div>
  </footer>;
}
