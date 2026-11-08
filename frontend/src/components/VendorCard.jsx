import { ArrowUpRight, BadgeCheck, MapPin } from "lucide-react";
import { useReducedMotion } from "motion/react";
import * as motion from "motion/react-m";
import { Link } from "react-router-dom";
import { formatCurrency } from "../utils/format";
import { getVendorGallery, getVendorImage } from "../utils/vendor";
import Card from "./Card";

export default function VendorCard({ vendor }) {
  const reduceMotion = useReducedMotion();
  const approved = vendor.verificationStatus === "approved" || (!vendor.verificationStatus && vendor.verified);
  const hasPrice = vendor.pricing !== undefined && vendor.pricing !== null;
  const hasVendorPhoto = getVendorGallery(vendor).length > 0;
  return <motion.article whileHover={reduceMotion ? undefined : { y: -4 }} transition={{ duration: 0.2 }} className="min-w-0 h-full">
    <Card className="group flex h-full flex-col overflow-hidden !rounded-[1.5rem] !border-ink/10 !shadow-none transition-shadow hover:!shadow-soft">
      <Link to={`/vendors/${vendor._id}`} aria-label={`Explore ${vendor.businessName}`} className="relative block aspect-[4/3] overflow-hidden bg-sand focus-visible:outline-offset-[-4px]">
        <img src={getVendorImage(vendor)} alt={hasVendorPhoto ? vendor.businessName : `${vendor.serviceCategory} inspiration`} loading="lazy" decoding="async" width="640" height="480" className="h-full w-full object-cover transition-transform duration-500 motion-reduce:transition-none group-hover:scale-[1.035] motion-reduce:group-hover:scale-100" />
        {approved && <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-bold text-ink shadow-sm"><BadgeCheck className="h-3.5 w-3.5 text-coral" aria-hidden="true" />Verified vendor</span>}
        {!hasVendorPhoto && <span className="absolute bottom-3 left-3 rounded-full bg-white/95 px-2.5 py-1.5 text-[9px] font-semibold text-ink/70">Category inspiration</span>}
      </Link>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-coral">{vendor.serviceCategory}</p>
        <h3 className="mt-2 break-words font-editorial text-[1.65rem] leading-tight tracking-tight">{vendor.businessName}</h3>
        <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-ink/65"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="min-w-0 break-words">{vendor.location || "Location available on request"}</span></p>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-6">
          <div className="min-w-0 max-w-full"><p className="text-[10px] font-medium text-ink/65">{hasPrice ? "Starting from" : "Pricing"}</p><p className="mt-1 break-words text-base font-extrabold tracking-tight">{hasPrice ? formatCurrency(vendor.pricing) : "On request"}</p></div>
          <Link to={`/vendors/${vendor._id}`} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-ink/10 px-3.5 text-[11px] font-bold transition-colors hover:border-coral hover:bg-coral/5 hover:text-coral">View details<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
        </div>
      </div>
    </Card>
  </motion.article>;
}
