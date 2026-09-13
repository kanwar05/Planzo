import { ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import Button from "../components/Button";
import SectionHeading from "../components/SectionHeading";
import { services } from "../data/services";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export default function ServicesPage() {
  useDocumentTitle("Event services");
  return (
    <div className="services-page min-h-screen bg-[#FFF9F2]">
      <section className="bg-[#FFE1D6] py-16 sm:py-20"><div className="container-shell text-[#4A2148]"><SectionHeading eyebrow="The Planzo collection" title="The right expert for every detail." description="Browse trusted specialists, compare their work, and build your perfect event team." /></div></section>
      <section className="section-pad container-shell bg-[#FFF9F2]">
        <div className="grid gap-7 md:grid-cols-2 lg:grid-cols-3">
          {services.map(({ title, description, icon: Icon, image }, index) => (
            <motion.article initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.05 }} key={title} className={`group overflow-hidden rounded-[1.75rem] border border-[#4A2148]/15 bg-white shadow-[0_12px_35px_rgba(74,33,72,0.08)] transition duration-300 hover:-translate-y-2 hover:border-[#F26B5E]/60 hover:shadow-[0_20px_45px_rgba(74,33,72,0.16)] ${index === 0 ? "lg:col-span-2" : ""}`}>
              <div className={`overflow-hidden rounded-t-[1.75rem] ${index === 0 ? "h-80" : "h-72"}`}><img src={image} alt={title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /></div>
              <div className="flex min-h-[250px] flex-col p-8"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#B8D8C0] text-[#4A2148]"><Icon className="h-5 w-5" /></span><h2 className="mt-5 text-2xl font-extrabold italic text-[#4A2148]">{title}</h2><p className="mt-3 text-sm leading-6 text-[#4A2148]/65">{description}</p><Button to={`/vendors?category=${encodeURIComponent(title)}`} variant="primary" className="mt-auto self-start !bg-[#F26B5E] !px-5 !text-white hover:!bg-[#d9584d]">Explore service <ArrowUpRight className="h-4 w-4" /></Button></div>
            </motion.article>
          ))}
        </div>
      </section>
    </div>
  );
}
