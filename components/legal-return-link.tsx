import Link from "next/link";

type LegalReturnLinkProps = {
  className?: string;
};

export function LegalReturnLink({ className = "" }: LegalReturnLinkProps) {
  const classNames = [
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-black bg-[#f7ff4f] px-4 py-2 text-sm font-black text-black shadow-[0_4px_0_0_#111111] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Link
      href="/#compose-section"
      className={classNames}
      aria-label="חזרה לכלי התשובות של SayBack"
    >
      <span aria-hidden="true" className="text-lg leading-none">
        →
      </span>
      <span>חזרה לכלי התשובות</span>
    </Link>
  );
}
