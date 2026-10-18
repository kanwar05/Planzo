import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import hero from "../assets/planzo-hero.png";
import Button from "../components/Button";
import SectionHeading from "../components/SectionHeading";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import VendorCard from "../components/VendorCard";
import { services } from "../data/services";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { getVendors } from "../services/vendorService";
import { getApiError } from "../utils/apiError";

export default function HomePage() {
  useDocumentTitle("Plan beautiful events");
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [popularVendors, setPopularVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getVendors({ limit: 3 })
      .then((data) => { if (active) setPopularVendors(data.vendors || []); })
      .catch((err) => { if (active) setError(getApiError(err, "Unable to load vendors.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const search = (event) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("search", query.trim());
    if (city.trim()) params.set("city", city.trim());
    navigate('/vendors?' + params.toString());
  };

  return (
    <>
      <section className="container-shell pt-4 sm:pt-7">
        <div className="relative min-h-[680px] overflow-hidden rounded-[2rem] bg-ink sm:rounded-[2.75rem] lg:min-h-[720px]">
          <img
            src={hero}
            alt="Event professionals preparing an elegant celebration"
            className="absolute inset-0 h-full w-full object-cover object-center lg:object-[55%_center]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/75 to-ink/5" />
          <div className="absolute inset-0 bg-hero-glow" />
          <div className="relative z-10 flex min-h-[680px] max-w-3xl flex-col justify-center px-6 py-16 sm:px-12 lg:min-h-[720px] lg:px-20">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65 }}
            >
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-white backdrop-blur">
                <Sparkles className="h-4 w-4 text-coral" /> Find the right team for your celebration
              </div>
              <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.04] text-white sm:text-6xl lg:text-7xl">
                Plan Your Perfect Event With{" "}
                <span className="text-[#ff9a8f]">Trusted Vendors</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-white/65 sm:text-lg">
                From the first idea to the last dance, discover exceptional
                professionals who make every detail feel effortless.
              </p>
            </motion.div>
            <motion.form
              onSubmit={search}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.65 }}
              className="glass mt-9 grid gap-2 rounded-[1.5rem] p-2 sm:grid-cols-[1fr_1fr_auto]"
            >
              <label className="flex items-center gap-3 rounded-2xl px-4 py-3">
                <Search className="h-5 w-5 text-coral" />
                <span className="flex-1">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-ink/40">
                    What do you need?
                  </span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-ink/40"
                    placeholder="DJ, venue, catering..."
                  />
                </span>
              </label>
              <label className="flex items-center gap-3 rounded-2xl border-t border-ink/8 px-4 py-3 sm:border-l sm:border-t-0">
                <MapPin className="h-5 w-5 text-coral" />
                <span>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-ink/40">
                    Location
                  </span>
                  <input aria-label="Event city" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Enter your city" className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-ink/40" />
                </span>
              </label>
              <Button type="submit" className="sm:px-7">
                <Search className="h-4 w-4" /> Search
              </Button>
            </motion.form>
            <div className="mt-8 flex flex-wrap gap-x-7 gap-y-3 text-xs font-semibold text-white/60">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-coral" /> Approved vendors
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-coral" /> Transparent
                pricing
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-coral" /> Secure booking
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="section-pad container-shell">
        <div className="flex items-end justify-between gap-8">
          <SectionHeading
            eyebrow="Explore by service"
            title="Everything your event needs."
            description="Handpicked professionals for every moving part of your celebration."
          />
          <Button to="/services" variant="ghost" className="hidden sm:flex">
            View all <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">
          {services.map(({ title, icon: Icon, image }) => (
            <motion.button
              onClick={() =>
                navigate(`/vendors?category=${encodeURIComponent(title)}`)
              }
              whileHover={{ y: -5 }}
              key={title}
              className="group overflow-hidden rounded-[1.5rem] border border-ink/8 bg-white text-left shadow-soft"
            >
              <div className="h-28 overflow-hidden">
                <img
                  src={image}
                  alt=""
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
                />
              </div>
              <div className="p-4">
                <Icon className="h-5 w-5 text-coral" />
                <p className="mt-3 text-sm font-bold leading-tight">{title}</p>
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="bg-sand/60">
        <div className="section-pad container-shell">
          <SectionHeading
            eyebrow="Simple by design"
            title="How Planzo works"
            description="Three easy steps from inspiration to confirmed."
            align="center"
          />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              [
                Search,
                "01",
                "Discover your match",
                "Browse approved vendors and compare their services, photos, and starting prices.",
              ],
              [
                Users,
                "02",
                "Connect with confidence",
                "Send a booking request with your event date, location, and requirements.",
              ],
              [
                CalendarCheck,
                "03",
                "Book and celebrate",
                "Track acceptance in your dashboard and contact the vendor once confirmed.",
              ],
            ].map(([Icon, number, title, text]) => (
              <div
                key={number}
                className="relative rounded-[2rem] bg-white p-8 shadow-soft"
              >
                <span className="absolute right-7 top-5 font-display text-5xl font-extrabold text-sand">
                  {number}
                </span>
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-plum text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-7 text-xl font-extrabold">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-ink/50">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-pad container-shell">
        <div className="flex items-end justify-between gap-8">
          <SectionHeading
            eyebrow="Loved locally"
            title="Popular vendors"
            description="Explore approved professionals for your next celebration."
          />
          <Button to="/vendors" variant="outline" className="hidden sm:flex">
            Explore all vendors
          </Button>
        </div>
        <div className="mt-10">
          {loading ? <LoadingSkeleton /> : error ? <EmptyState title="Vendors unavailable" description={error} actionTo="/vendors" actionLabel="Browse vendors" /> : popularVendors.length ? <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{popularVendors.map((vendor) => <VendorCard key={vendor._id} vendor={vendor} />)}</div> : <EmptyState title="Vendors are on their way" description="Approved businesses will appear here as they join Planzo." actionTo="/register" actionLabel="Join as a vendor" />}
        </div>
      </section>

      <section className="section-pad container-shell">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-coral px-6 py-14 text-center text-white sm:px-12 sm:py-20">
          <div className="absolute -left-20 -top-20 h-56 w-56 rounded-full border-[40px] border-white/10" />
          <div className="absolute -bottom-16 right-8 h-48 w-48 rounded-full bg-plum/15 blur-2xl" />
          <div className="relative">
            <ShieldCheck className="mx-auto h-9 w-9" />
            <h2 className="mx-auto mt-5 max-w-2xl text-3xl font-extrabold sm:text-5xl">
              Your dream event starts with the right people.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-white/75">
              Tell us what you’re planning. We’ll help you find the team to
              bring it to life.
            </p>
            <Button to="/vendors" variant="dark" className="mt-8">
              Find your vendors <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
