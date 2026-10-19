export default function SectionHeading({ eyebrow, title, description, align = "left", as: Heading = "h2" }) {
  return (
    <div className={`max-w-2xl ${align === "center" ? "mx-auto text-center" : ""}`}>
      {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
      <Heading className="font-editorial text-3xl font-normal leading-[1.12] sm:text-4xl lg:text-[46px]">{title}</Heading>
      {description && <p className="mt-4 max-w-lg text-sm leading-7 text-ink/65">{description}</p>}
    </div>
  );
}
