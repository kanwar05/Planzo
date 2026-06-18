import { Outlet } from "react-router-dom";
import Logo from "../components/Logo";

export default function AuthLayout() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[0.85fr_1.15fr]">
      <section className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-16">
        <Logo />
        <div className="mx-auto flex w-full max-w-md flex-1 items-center py-12"><Outlet /></div>
      </section>
      <section className="relative hidden overflow-hidden bg-ink lg:block">
        <img src="https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1400&q=85" alt="Elegant celebration" className="absolute inset-0 h-full w-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-14 text-white"><p className="text-sm font-bold uppercase tracking-[0.2em] text-coral">Plan less. Celebrate more.</p><h2 className="mt-4 max-w-xl text-5xl font-extrabold leading-tight">Everything for your event, in one beautiful place.</h2></div>
      </section>
    </main>
  );
}
