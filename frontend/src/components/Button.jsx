import { LoaderCircle } from "lucide-react";
import { Link } from "react-router-dom";

const styles = {
  primary: "bg-coral text-white shadow-lg shadow-coral/20 hover:-translate-y-0.5 hover:bg-[#e86558]",
  dark: "bg-ink text-white hover:-translate-y-0.5 hover:bg-plum",
  outline: "border border-ink/15 bg-white text-ink hover:-translate-y-0.5 hover:border-coral/50 hover:text-coral",
  ghost: "bg-transparent text-ink hover:bg-ink/5",
};

export default function Button({ children, variant = "primary", className = "", to, loading, ...props }) {
  const classes = `inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition duration-300 disabled:cursor-not-allowed disabled:opacity-60 ${styles[variant]} ${className}`;
  if (to) return <Link className={classes} to={to} {...props}>{children}</Link>;
  return <button className={classes} {...props}>{loading && <LoaderCircle className="h-4 w-4 animate-spin" />}{children}</button>;
}
