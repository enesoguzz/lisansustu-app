import Link from "next/link";
import { Logo } from "./logo";
import { NAV, SITE } from "@/lib/site";
import { Year } from "./year";

const LEGAL = [
  { href: "/kvkk", label: "KVKK Aydınlatma Metni" },
  { href: "/gizlilik", label: "Gizlilik" },
  { href: "/iletisim", label: "İletişim" },
];

export function Footer() {
  return (
    <footer className="bg-navy text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-[2fr_1fr_1fr]">
        <div className="space-y-3">
          <div className="[&_a]:text-white [&_rect]:fill-white [&_path]:fill-navy [&_path[stroke]]:stroke-navy">
            <Logo />
          </div>
          <p className="max-w-sm text-white/70">{SITE.tagline}. Yüksek lisans ve doktora yolculuğunda yanındayız.</p>
        </div>
        <FooterCol title="Keşfet" links={NAV} />
        <FooterCol title="Kurumsal" links={LEGAL} />
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-5 text-sm text-white/60">
          © <Year /> {SITE.name}. Kabul ihtimalleri tahminidir, kesinlik belirtmez.
        </p>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-white/50">{title}</h3>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="font-semibold text-white/85 hover:text-white">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
