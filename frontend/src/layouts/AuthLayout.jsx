import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Link, Outlet } from "react-router-dom";
import Logo from "../components/Logo";
import celebrationImage from "../assets/optimized/luxury_wedding_editorial_1788675454322.webp";

export default function AuthLayout() {
  return (
    <main className="grid min-h-[100svh] bg-cream lg:grid-cols-[1fr_1fr]">
      <section className="flex min-h-[100svh] min-w-0 flex-col px-5 py-6 sm:px-10 lg:px-14 xl:px-20">
        <div className="flex flex-wrap items-center justify-between gap-3"><Logo /><Link to="/vendors" className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-ink/65 hover:text-coral"><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />Explore vendors</Link></div>
        <div className="mx-auto flex w-full max-w-md flex-1 items-center py-10 sm:py-14"><Outlet /></div>
        <p className="text-center text-[11px] leading-6 text-ink/65">Good people. Thoughtful services. Beautiful celebrations.</p>
      </section>
      <section aria-label="Celebration inspiration" className="relative m-4 ml-0 hidden overflow-hidden rounded-[2rem] bg-ink lg:block">
        <img src={celebrationImage} alt="An intimate wedding ceremony surrounded by flowers and greenery" width={1024} height={1024} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/25 to-ink/10" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-9 text-white"><span className="rounded-full border border-white/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em]">Made for life's moments</span><ArrowUpRight className="h-5 w-5" aria-hidden="true" /></div>
        <div className="absolute inset-x-0 bottom-0 p-9 text-white xl:p-14"><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80">Plan less. Celebrate more.</p><h2 className="mt-5 max-w-xl font-editorial text-5xl leading-[1.1] xl:text-6xl">For the moments<br />that become<br /><span className="italic text-[#F0C8B7]">memories.</span></h2><p className="mt-6 max-w-sm text-sm leading-7 text-white/80">Discover the people and places that bring your celebration to life.</p><div className="mt-9 h-px w-full bg-white/25" /><p className="mt-5 text-xs text-white/70">A little planning. A lifetime to remember.</p></div>
      </section>
    </main>
  );
}
