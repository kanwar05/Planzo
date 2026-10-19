export default function Card({ children, className = "", as: Component = "div", ...props }) {
  return <Component className={`rounded-2xl border bg-white shadow-soft sm:rounded-3xl ${className}`} {...props}>{children}</Component>;
}
