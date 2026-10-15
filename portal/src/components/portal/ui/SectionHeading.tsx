export interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  sub?: string;
  align?: "start" | "center";
}

export const SectionHeading = ({ eyebrow, title, sub, align = "start" }: SectionHeadingProps) => (
  <div className={align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl text-start"}>
    {eyebrow && (
      <p
        className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent ${align === "center" ? "justify-center" : ""}`}
      >
        <span className="h-1 w-6 rounded-full bg-accent" />
        {eyebrow}
      </p>
    )}
    <h2 className="font-display mt-3 text-3xl font-black leading-[1.12] tracking-tight text-foreground sm:text-4xl lg:text-5xl">
      {title}
    </h2>
    {sub && <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">{sub}</p>}
  </div>
);
