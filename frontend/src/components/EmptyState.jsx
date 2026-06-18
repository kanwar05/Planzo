import { SearchX } from "lucide-react";
import Button from "./Button";

export default function EmptyState({ onClear }) {
  return (
    <div className="grid min-h-80 place-items-center rounded-[2rem] border border-dashed border-ink/15 bg-white p-8 text-center">
      <div><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-coral/10 text-coral"><SearchX /></span><h3 className="mt-5 text-xl font-extrabold">No vendors found</h3><p className="mt-2 text-sm text-ink/50">Try widening your search or clearing the current filters.</p><Button onClick={onClear} className="mt-5">Clear filters</Button></div>
    </div>
  );
}
