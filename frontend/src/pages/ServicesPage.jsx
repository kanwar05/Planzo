import { ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import Button from "../components/Button";
import SectionHeading from "../components/SectionHeading";
import { services } from "../data/services";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export default function ServicesPage() {
  useDocumentTitle("Event services");
  return (
    <>
      <section className="bg-sand/60 py-16 sm:py-20"><div className="container-shell"><SectionHeading eyebrow="The PLANZO collection" title="The right expert for every detail." description="Browse trusted specialists, compare their work, and build your perfect event team." /></div></section>
      <section className="section-pad container-shell">
        <div className="grid gap-7 md:grid-cols-2 lg:grid-cols-3">
          {services.map(({ title, description, icon: Icon, image }, index) => (
            <motion.article initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.05 }} key={title} className={`group overflow-hidden rounded-[2rem] border bg-white shadow-soft ${index === 0 ? "lg:col-span-2" : ""}`}>
              <div className={`overflow-hidden ${index === 0 ? "h-72" : "h-60"}`}><img src={image} alt={title} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" /></div>
              <div className="p-7"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-coral/10 text-coral"><Icon className="h-5 w-5" /></span><h2 className="mt-5 text-2xl font-extrabold">{title}</h2><p className="mt-2 text-sm leading-6 text-ink/50">{description}</p><Button to={`/vendors?category=${encodeURIComponent(title)}`} variant="ghost" className="mt-4 !px-0 hover:!bg-transparent">Explore service <ArrowUpRight className="h-4 w-4" /></Button></div>
            </motion.article>
          ))}
        </div>
      </section>
    </>
  );
}
