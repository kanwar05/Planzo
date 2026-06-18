import { ArrowUpRight, Heart, MapPin, Star } from "lucide-react";
import { motion } from "framer-motion";
import Button from "./Button";
import Card from "./Card";

export default function VendorCard({ vendor }) {
  return (
    <motion.div whileHover={{ y: -6 }} transition={{ duration: 0.25 }}>
      <Card className="group overflow-hidden">
        <div className="relative h-56 overflow-hidden">
          <img src={vendor.image} alt={vendor.name} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
          <button className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/90 shadow-md backdrop-blur"><Heart className="h-4 w-4" /></button>
          {vendor.featured && <span className="absolute left-4 top-4 rounded-full bg-ink px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-white">Top choice</span>}
        </div>
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs font-bold uppercase tracking-wider text-coral">{vendor.type}</p><h3 className="mt-1 text-lg font-extrabold">{vendor.name}</h3></div>
            <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {vendor.rating}</span>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-sm text-ink/50"><MapPin className="h-4 w-4" />{vendor.location}<span className="mx-1">·</span>{vendor.experience} yrs exp.</div>
          <div className="mt-5 flex items-center justify-between border-t border-ink/8 pt-4">
            <div><p className="text-[11px] text-ink/40">Packages from</p><p className="text-sm font-bold">{vendor.price.split("–")[0]}</p></div>
            <Button to={`/vendors/${vendor.id}`} variant="ghost" className="!px-3">View details <ArrowUpRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
