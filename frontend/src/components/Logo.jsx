import { Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

export default function Logo({ light = false }) {
  return (
    <Link to="/" className={`flex items-center gap-2 font-display text-xl font-extrabold tracking-[-0.06em] ${light ? "text-white" : "text-ink"}`}>
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-coral text-white shadow-lg shadow-coral/20"><Sparkles className="h-4 w-4" /></span>
      PLANZO
    </Link>
  );
}
