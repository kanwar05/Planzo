import { ImagePlus, Save, UploadCloud } from "lucide-react";
import { useState } from "react";
import Button from "../components/Button";
import Card from "../components/Card";
import { services } from "../data/services";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export default function VendorProfilePage() {
  useDocumentTitle("Vendor profile setup");
  const [saved, setSaved] = useState(false);
  return (
    <div className="max-w-4xl">
      <div><p className="text-sm font-bold text-coral">Make a memorable first impression</p><h1 className="mt-1 text-3xl font-extrabold">Set up your vendor profile.</h1><p className="mt-2 text-sm text-ink/45">Complete profiles receive up to 3× more booking requests.</p></div>
      {saved && <div className="mt-6 rounded-2xl bg-sage/15 px-5 py-4 text-sm font-bold text-sage">Profile saved successfully.</div>}
      <form onSubmit={(event) => { event.preventDefault(); setSaved(true); }} className="mt-7 space-y-6">
        <Card className="grid gap-5 p-6 sm:grid-cols-2">
          <div className="sm:col-span-2"><h2 className="text-lg font-extrabold">Business details</h2></div>
          <div><label className="label">Business name</label><input required className="field" defaultValue="Velvet Petal Decor" /></div>
          <div><label className="label">Service category</label><select required className="field" defaultValue="Decoration">{services.map((item) => <option key={item.slug}>{item.title}</option>)}</select></div>
          <div className="sm:col-span-2"><label className="label">Description</label><textarea required className="field min-h-36 resize-none" defaultValue="We create warm, modern event spaces with floral design, custom installations, and thoughtful styling." /></div>
          <div><label className="label">Experience (years)</label><input required type="number" className="field" defaultValue="12" /></div>
          <div><label className="label">Starting price</label><input required className="field" defaultValue="₹80,000" /></div>
          <div className="sm:col-span-2"><label className="label">Location</label><input required className="field" defaultValue="Mumbai, Maharashtra" /></div>
        </Card>
        <Card id="portfolio" className="p-6"><h2 className="text-lg font-extrabold">Portfolio</h2><p className="mt-1 text-xs text-ink/40">Upload clear, high-quality photos. Landscape images work best.</p><label className="mt-6 grid min-h-52 cursor-pointer place-items-center rounded-[1.5rem] border-2 border-dashed border-ink/10 bg-sand/25 text-center transition hover:border-coral/40 hover:bg-coral/5"><input type="file" multiple accept="image/*" className="hidden" /><span><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-coral shadow-sm"><ImagePlus className="h-5 w-5" /></span><strong className="mt-4 block text-sm">Drop images here or browse</strong><span className="mt-1 block text-xs text-ink/40">PNG, JPG or WEBP · up to 10MB each</span></span></label></Card>
        <div className="flex justify-end"><Button type="submit"><Save className="h-4 w-4" /> Save profile</Button></div>
      </form>
    </div>
  );
}
