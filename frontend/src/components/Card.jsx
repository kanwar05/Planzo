export default function Card({ children, className = "" }) {
  return <div className={`rounded-[1.75rem] border border-ink/8 bg-white shadow-soft ${className}`}>{children}</div>;
}
