"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import clsx from "clsx";
import { Logo } from "./logo";
import { NAV } from "@/lib/site";
import { useAuth } from "./auth/auth-provider";

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { user, loading } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={clsx(
        "sticky top-0 z-40 bg-white/90 backdrop-blur transition-shadow",
        scrolled ? "shadow-[0_2px_0_var(--navy-soft)]" : "",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav className="hidden items-center gap-8 md:flex" aria-label="Ana menü">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="font-bold text-navy-muted transition-colors hover:text-navy"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={clsx("hidden items-center gap-3 transition-opacity md:flex", loading && "opacity-0")}>
          {user ? (
            <Link href="/hesabim" className="btn btn-primary !px-4 !py-2 text-sm">
              Hesabım
            </Link>
          ) : (
            <>
              <Link href="/giris" className="btn btn-outline !px-4 !py-2 text-sm">
                Giriş yap
              </Link>
              <Link href="/kayit" className="btn btn-primary !px-4 !py-2 text-sm">
                Ücretsiz başla
              </Link>
            </>
          )}
        </div>
        <button
          className="rounded-xl p-2 text-navy md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Menüyü kapat" : "Menüyü aç"}
          aria-expanded={open}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t-2 border-navy-soft bg-white md:hidden"
            aria-label="Mobil menü"
          >
            <div className="flex flex-col gap-1 px-4 py-4">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-3 text-lg font-bold text-navy hover:bg-navy-soft"
                >
                  {item.label}
                </Link>
              ))}
              {user ? (
                <Link href="/hesabim" onClick={() => setOpen(false)} className="btn btn-primary mt-3 text-sm">
                  Hesabım
                </Link>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Link href="/giris" onClick={() => setOpen(false)} className="btn btn-outline text-sm">
                    Giriş yap
                  </Link>
                  <Link href="/kayit" onClick={() => setOpen(false)} className="btn btn-primary text-sm">
                    Başla
                  </Link>
                </div>
              )}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
