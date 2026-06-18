export default function SectionHeading({ eyebrow, title, description, align = "left" }) {
  return (
    <div className={`max-w-2xl ${align === "center" ? "mx-auto text-center" : ""}`}>
      {eyebrow && <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.2em] text-coral">{eyebrow}</p>}
      <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl">{title}</h2>
      {description && <p className="mt-4 text-base leading-7 text-ink/55 sm:text-lg">{description}</p>}
    </div>
  );
}
