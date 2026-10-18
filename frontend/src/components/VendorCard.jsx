import { ArrowUpRight, MapPin } from "lucide-react";
import { motion } from "framer-motion";
import { formatCurrency } from "../utils/format";
import { getVendorImage } from "../utils/vendor";
import Button from "./Button";
import Card from "./Card";
export default function VendorCard({
  vendor
}) {
  return <motion.div whileHover={{
    y: -6
  }} transition={{
    duration: 0.25
  }}>
    <Card className="group h-full overflow-hidden">
      <div className="h-56 overflow-hidden">
        <img src={getVendorImage(vendor)} alt={vendor.businessName} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
      </div>
      <div className="p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-coral">
          {vendor.serviceCategory}
        </p>
        <h3 className="mt-1 text-lg font-extrabold">
          {vendor.businessName}
        </h3>
        <p className="mt-4 flex items-center gap-1.5 text-sm text-ink/50">
          <MapPin className="h-4 w-4 shrink-0" />
          {vendor.location}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-ink/8 pt-4">
          <div>
            <p className="text-[11px] text-ink/40">Starting price</p>
            <p className="text-sm font-bold">
              {formatCurrency(vendor.pricing || 0)}
            </p>
          </div>
          <Button to={`/vendors/${vendor._id}`} variant="ghost" className="!px-3">View details <ArrowUpRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </Card>
  </motion.div>;
}
