export function SectionHeading({
  eyebrow,
  title,
  sub,
  align = "start",
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  align?: "start" | "center";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <span className="eyebrow">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        {eyebrow}
      </span>
      <h2 className="mt-5 text-balance text-3xl font-semibold leading-tight tracking-normal text-foreground sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      {sub && (
        <p className="mt-4 max-w-2xl text-base font-medium leading-relaxed text-muted-foreground sm:text-lg">
          {sub}
        </p>
      )}
    </div>
  );
}
