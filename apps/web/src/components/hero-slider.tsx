"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { Mascot } from "./mascot";

type Slide = {
  title: string;
  text: string;
  cta: { href: string; label: string };
  art: React.ReactNode;
};

const SLIDES: Slide[] = [
  {
    title: "Tüm lisansüstü ilanlar tek ekranda",
    text: "Üniversiteleri tek tek gezme. Açık başvuruları ve istenen şartları bir arada gör.",
    cta: { href: "/programlar", label: "Programları keşfet" },
    art: <ListingsArt />,
  },
  {
    title: "Kabul ihtimalini yüzde ile gör",
    text: "Puanlarını gir, sana en uygun programları ihtimale göre sıralayalım.",
    cta: { href: "/kayit", label: "Ücretsiz başla" },
    art: <GaugeArt />,
  },
  {
    title: "ALES ve YDS'ye planlı hazırlan",
    text: "Çalışma planları, püf noktaları ve tez rehberleri ücretsiz.",
    cta: { href: "/hazirlik", label: "Hazırlığa başla" },
    art: <PlanArt />,
  },
];

const AUTOPLAY_MS = 6000;

export function HeroSlider() {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [paused, setPaused] = useState(false);

  const go = useCallback((next: number) => {
    setDir(next > index || (index === SLIDES.length - 1 && next === 0) ? 1 : -1);
    setIndex((next + SLIDES.length) % SLIDES.length);
  }, [index]);

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => go(index + 1), AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [index, paused, go]);

  const slide = SLIDES[index];

  return (
    <section
      className="relative overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Öne çıkanlar"
    >
      <div className="mx-auto grid min-h-[calc(100svh-4rem)] max-w-6xl items-center gap-10 px-4 pb-24 pt-10 md:grid-cols-2 md:py-0">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={index}
            custom={dir}
            initial={{ opacity: 0, x: dir * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -40 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="order-2 text-center md:order-1 md:text-left"
            aria-live="polite"
          >
            <h1 className="text-4xl font-black leading-tight text-navy md:text-5xl lg:text-6xl">
              {slide.title}
            </h1>
            <p className="mx-auto mt-5 max-w-md text-lg font-semibold text-navy-muted md:mx-0">
              {slide.text}
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row md:items-start">
              <Link href={slide.cta.href} className="btn btn-primary w-full sm:w-auto">
                {slide.cta.label}
              </Link>
              <Link href="/giris" className="btn btn-outline w-full sm:w-auto">
                Hesabım var
              </Link>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="order-1 flex justify-center md:order-2">
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.9, rotate: -3 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.9, rotate: 3 }}
              transition={{ type: "spring", stiffness: 220, damping: 20 }}
              className="relative h-72 w-72 md:h-[26rem] md:w-[26rem]"
            >
              {slide.art}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-6 flex items-center justify-center gap-4">
        <button onClick={() => go(index - 1)} className="rounded-full p-2 text-navy hover:bg-navy-soft" aria-label="Önceki">
          <ChevronLeft />
        </button>
        <div className="flex gap-2">
          {SLIDES.map((s, i) => (
            <button
              key={s.title}
              onClick={() => go(i)}
              aria-label={`${i + 1}. slayt`}
              aria-current={i === index}
              className={clsx(
                "h-3 rounded-full transition-all",
                i === index ? "w-8 bg-navy" : "w-3 bg-navy-soft hover:bg-navy-muted/40",
              )}
            />
          ))}
        </div>
        <button onClick={() => go(index + 1)} className="rounded-full p-2 text-navy hover:bg-navy-soft" aria-label="Sonraki">
          <ChevronRight />
        </button>
      </div>
    </section>
  );
}

function Blob() {
  return <div className="absolute inset-6 rounded-[40%_60%_55%_45%] bg-navy-soft" />;
}

function ListingsArt() {
  const cards = ["Boğaziçi · Bilgisayar Müh.", "ODTÜ · İktisat", "İTÜ · Mimarlık"];
  return (
    <div className="relative h-full w-full">
      <Blob />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        {cards.map((c, i) => (
          <motion.div
            key={c}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.12 }}
            className="flex w-56 items-center gap-3 rounded-2xl border-2 border-navy-soft bg-white px-4 py-3 shadow-[0_4px_0_var(--navy-soft)] md:w-72"
          >
            <span className="h-3 w-3 rounded-full bg-emerald-500" />
            <span className="text-sm font-bold text-navy md:text-base">{c}</span>
            <span className="ml-auto text-xs font-extrabold text-emerald-600">AÇIK</span>
          </motion.div>
        ))}
      </div>
      <Mascot className="absolute -bottom-2 -right-2 h-24 w-24 md:h-32 md:w-32" />
    </div>
  );
}

function GaugeArt() {
  const target = 82;
  const r = 70;
  const c = 2 * Math.PI * r;
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 1200);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="relative h-full w-full">
      <Blob />
      <div className="absolute inset-0 flex items-center justify-center">
        <svg viewBox="0 0 180 180" className="h-56 w-56 -rotate-90 md:h-72 md:w-72">
          <circle cx="90" cy="90" r={r} fill="#fff" stroke="#dfe5f7" strokeWidth="16" />
          <motion.circle
            cx="90" cy="90" r={r} fill="none" stroke="#1a2e6e" strokeWidth="16" strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - target / 100) }}
            transition={{ duration: 1.2, ease: [0.33, 1, 0.68, 1] }}
          />
        </svg>
        <div className="absolute text-center">
          <div className="text-5xl font-black text-navy md:text-6xl">%{n}</div>
          <div className="text-sm font-bold text-navy-muted">tahmini kabul</div>
        </div>
      </div>
      <Mascot className="absolute -bottom-2 -left-2 h-24 w-24 md:h-32 md:w-32" />
    </div>
  );
}

function PlanArt() {
  const items = ["Sözel: paragraf 20 soru", "Sayısal: problemler", "YDS: 30 kelime"];
  return (
    <div className="relative h-full w-full">
      <Blob />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-60 rounded-3xl border-2 border-navy-soft bg-white p-5 shadow-[0_6px_0_var(--navy-soft)] md:w-72">
          <div className="mb-3 text-sm font-extrabold uppercase tracking-wider text-navy-muted">Bugünün planı</div>
          {items.map((t, i) => (
            <div key={t} className="flex items-center gap-3 py-2">
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3 + i * 0.25, type: "spring" }}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-navy text-xs text-white"
              >
                ✓
              </motion.span>
              <span className="text-sm font-bold text-navy md:text-base">{t}</span>
            </div>
          ))}
        </div>
      </div>
      <Mascot className="absolute -right-2 -top-2 h-24 w-24 md:h-32 md:w-32" />
    </div>
  );
}
