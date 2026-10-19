import { Flower2 } from "lucide-react";
import { Link } from "react-router-dom";

export default function Logo({ light = false }) {
  return (
    <Link to="/" aria-label="Planzo home" className={`inline-flex min-h-11 shrink-0 items-center gap-2 font-display text-[25px] font-extrabold tracking-[-0.055em] ${light ? "text-white" : "text-ink"}`}>
      <Flower2 aria-hidden="true" className="h-8 w-8 text-coral" strokeWidth={1.7} />
      planzo<span className="-ml-1 text-coral">.</span>
    </Link>
  );
}
