import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import hero from "../assets/planzo-hero.png";
import Button from "../components/Button";
import SectionHeading from "../components/SectionHeading";
import Toast from "../components/Toast";
import VendorCard from "../components/VendorCard";
import { useAuth } from "../context/AuthContext";
import { services } from "../data/services";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import {
  addFavorite,
  getFavorites,
  removeFavorite,
} from "../services/favoriteService";
import { getVendors } from "../services/vendorService";
import { getApiError } from "../utils/apiError";

const testimonials = [
  {
    name: "Ananya & Veer",
    event: "Wedding · Jaipur",
    quote:
      "We found our decorator, DJ, and planner in one weekend. Every vendor felt vetted, responsive, and genuinely invested.",
    image:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80",
  },
  {
    name: "Nikhil Malhotra",
    event: "25th Anniversary · Delhi",
    quote:
      "PLANZO turned a daunting family celebration into a clear, calm process. The shortlist was excellent.",
    image:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80",
  },
];

export default function HomePage() {
  useDocumentTitle("Plan beautiful events");
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [query, setQuery] = useState("");
  const [popularVendors, setPopularVendors] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState(() => new Set());
  const [favoriteLoadingId, setFavoriteLoadingId] = useState("");
  const [favoriteMessage, setFavoriteMessage] = useState("");
  const [favoriteError, setFavoriteError] = useState("");

  useEffect(() => {
    getVendors({ limit: 3 })
      .then((data) => setPopularVendors(data.vendors))
      .catch(() => setPopularVendors([]));
  }, []);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "customer") {
      setFavoriteIds(new Set());
      return;
    }

    getFavorites()
      .then((items) =>
        setFavoriteIds(
          new Set(items.map((item) => item.vendorId?._id).filter(Boolean)),
        ),
      )
      .catch(() => setFavoriteIds(new Set()));
  }, [isAuthenticated, user?.role]);

  const search = (event) => {
    event.preventDefault();
    navigate(`/vendors?q=${encodeURIComponent(query)}`);
  };

  const toggleFavorite = async (vendorId) => {
    if (!isAuthenticated || user?.role !== "customer") {
      navigate("/login");
      return;
    }

    const wasFavorited = favoriteIds.has(vendorId);
    setFavoriteLoadingId(vendorId);
    setFavoriteError("");
    setFavoriteMessage("");
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (wasFavorited) next.delete(vendorId);
      else next.add(vendorId);
      return next;
    });

    try {
      if (wasFavorited) {
        await removeFavorite(vendorId);
        setFavoriteMessage("Vendor removed from favorites");
      } else {
        await addFavorite(vendorId);
        setFavoriteMessage("Vendor added to favorites");
      }
    } catch (requestError) {
      setFavoriteIds((current) => {
        const next = new Set(current);
        if (wasFavorited) next.add(vendorId);
        else next.delete(vendorId);
        return next;
      });
      setFavoriteError(
        getApiError(requestError, "Unable to update favorites."),
      );
    } finally {
      setFavoriteLoadingId("");
    }
  };

  return (
    <>
      <Toast
        message={favoriteError || favoriteMessage}
        type={favoriteError ? "error" : "success"}
        onClose={() => {
          setFavoriteError("");
          setFavoriteMessage("");
        }}
      />
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
                <Sparkles className="h-4 w-4 text-coral" /> Trusted by 10,000+
                happy hosts
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
                  <span className="text-sm font-semibold">New Delhi</span>
                </span>
              </label>
              <Button type="submit" className="sm:px-7">
                <Search className="h-4 w-4" /> Search
              </Button>
            </motion.form>
            <div className="mt-8 flex flex-wrap gap-x-7 gap-y-3 text-xs font-semibold text-white/60">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-coral" /> Verified vendors
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
        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
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
            title="How PLANZO works"
            description="Three easy steps from inspiration to confirmed."
            align="center"
          />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              [
                Search,
                "01",
                "Discover your match",
                "Browse verified vendors, compare styles, pricing, reviews, and availability.",
              ],
              [
                Users,
                "02",
                "Connect with confidence",
                "Share your brief directly and get clear, personalized proposals.",
              ],
              [
                CalendarCheck,
                "03",
                "Book and celebrate",
                "Confirm your favorite, track every detail, then enjoy your day.",
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
            description="Consistently exceptional, highly rated, and ready for your date."
          />
          <Button to="/vendors" variant="outline" className="hidden sm:flex">
            Explore all vendors
          </Button>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {popularVendors.map((vendor) => (
            <VendorCard
              key={vendor._id}
              vendor={vendor}
              isFavorited={favoriteIds.has(vendor._id)}
              favoriteLoading={favoriteLoadingId === vendor._id}
              onToggleFavorite={() => toggleFavorite(vendor._id)}
            />
          ))}
        </div>
      </section>

      <section className="bg-plum text-white">
        <div className="section-pad container-shell">
          <div className="grid items-center gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-coral">
                Real celebrations
              </p>
              <h2 className="mt-4 text-4xl font-extrabold sm:text-5xl">
                Good planning should feel this good.
              </h2>
              <div className="mt-8 flex gap-6 text-sm text-white/55">
                <span>
                  <strong className="block text-2xl text-white">4.9/5</strong>
                  average rating
                </span>
                <span>
                  <strong className="block text-2xl text-white">98%</strong>
                  would recommend
                </span>
              </div>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              {testimonials.map((item) => (
                <div
                  key={item.name}
                  className="rounded-[2rem] border border-white/10 bg-white/8 p-7 backdrop-blur"
                >
                  <div className="flex gap-1 text-coral">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className="h-4 w-4 fill-current" />
                    ))}
                  </div>
                  <p className="mt-5 leading-7 text-white/80">“{item.quote}”</p>
                  <div className="mt-6 flex items-center gap-3">
                    <img
                      src={item.image}
                      alt={item.name}
                      className="h-11 w-11 rounded-full object-cover"
                    />
                    <div>
                      <p className="text-sm font-bold">{item.name}</p>
                      <p className="text-xs text-white/45">{item.event}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
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
