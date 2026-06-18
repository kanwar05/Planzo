import { Home, Search } from "lucide-react";
import Button from "../components/Button";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export default function NotFoundPage() {
  useDocumentTitle("Page not found");
  return <section className="container-shell grid min-h-[70vh] place-items-center py-20 text-center"><div><p className="font-display text-[9rem] font-extrabold leading-none text-sand">404</p><h1 className="-mt-5 text-4xl font-extrabold">This party isn’t here.</h1><p className="mx-auto mt-4 max-w-md text-ink/50">The page may have moved, or the confetti got a little out of hand.</p><div className="mt-7 flex justify-center gap-3"><Button to="/"><Home className="h-4 w-4" /> Go home</Button><Button to="/vendors" variant="outline"><Search className="h-4 w-4" /> Find vendors</Button></div></div></section>;
}
