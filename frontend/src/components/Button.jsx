import { LoaderCircle } from "lucide-react";
import { Link } from "react-router-dom";

const styles = {
  primary: "bg-coral text-white hover:bg-[#913e2b]",
  dark: "bg-ink text-white hover:bg-plum",
  outline: "border border-ink/15 bg-white text-ink hover:border-coral/50 hover:text-coral",
  ghost: "bg-transparent text-ink hover:bg-ink/5",
};

export default function Button({ children, variant = "primary", className = "", to, loading, ...props }) {
  const classes = `inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${styles[variant]} ${className}`;
  if (to) return <Link className={classes} to={to} {...props}>{children}</Link>;
  return <button type="button" className={classes} {...props} disabled={props.disabled || loading} aria-busy={loading || undefined}>{loading && <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />}{children}</button>;
}
