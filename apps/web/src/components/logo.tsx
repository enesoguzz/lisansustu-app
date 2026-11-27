import Link from "next/link";
import { SITE } from "@/lib/site";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-navy" aria-label={`${SITE.name} ana sayfa`}>
      <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
        <rect width="40" height="40" rx="12" fill="currentColor" />
        <path d="M8 17 20 11l12 6-12 6z" fill="#fff" />
        <path d="M13 20v6c0 2 3.5 4 7 4s7-2 7-4v-6l-7 3.5z" fill="#fff" opacity=".85" />
        <path d="M32 17v7" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="text-2xl font-black tracking-tight">{SITE.name.toLowerCase()}</span>
    </Link>
  );
}
