"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import clsx from "clsx";
import type { Issue } from "@lisansustu/core";
import { useAuth } from "@/components/auth/auth-provider";

const TABS = [
  { href: "/yonetim", label: "Dönem ilanları", match: ["/yonetim", "/yonetim/donem", "/yonetim/ilan"] },
  { href: "/yonetim/ice-aktar", label: "Dosyadan içe aktar", match: ["/yonetim/ice-aktar"] },
  { href: "/yonetim/universiteler", label: "Üniversiteler", match: ["/yonetim/universiteler", "/yonetim/universite"] },
];

/**
 * Yönetim sayfalarının çerçevesi: yalnızca yönetici hesabına içerik gösterir.
 * Bu yalnızca görünümdür; veriyi asıl koruyan veritabanındaki erişim kurallarıdır.
 */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAdmin, roleLoading } = useAuth();

  useEffect(() => {
    if (!roleLoading && !user) router.replace("/giris");
  }, [roleLoading, user, router]);

  if (roleLoading || !user) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="h-72 animate-pulse rounded-3xl bg-navy-soft" role="status" aria-label="Yükleniyor" />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <section className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="text-3xl font-black text-navy">Bu bölüm yöneticilere özel</h1>
        <p className="mt-3 font-semibold text-navy-muted">Giriş yaptığın hesabın yönetim paneline erişimi yok.</p>
        <Link href="/" className="btn btn-primary mt-8">
          Ana sayfaya dön
        </Link>
      </section>
    );
  }
  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6">
      <nav aria-label="Yönetim menüsü" className="mb-6 flex flex-wrap gap-2 border-b-2 border-navy-soft pb-3">
        {TABS.map((tab) => {
          const active = tab.match.includes(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "rounded-xl px-4 py-2 text-sm font-extrabold transition-colors",
                active ? "bg-navy text-white" : "text-navy-muted hover:bg-navy-soft hover:text-navy",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}

export function PageTitle({
  title,
  subtitle,
  back,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  back?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-block text-sm font-bold text-navy-muted hover:text-navy">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-navy md:text-3xl">{title}</h1>
          {subtitle && <div className="mt-1 font-semibold text-navy-muted">{subtitle}</div>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("rounded-3xl border-2 border-navy-soft bg-white p-4 md:p-6", className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-lg font-black text-navy">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

type Tone = "neutral" | "ok" | "warn" | "error" | "info";

const BADGE: Record<Tone, string> = {
  neutral: "bg-navy-soft text-navy",
  info: "bg-navy text-white",
  ok: "bg-emerald-100 text-emerald-800",
  warn: "bg-amber-100 text-amber-900",
  error: "bg-red-100 text-red-800",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={clsx("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-extrabold", BADGE[tone])}>{children}</span>;
}

const NOTICE: Record<Tone, string> = {
  neutral: "bg-navy-soft text-navy",
  info: "bg-navy-soft text-navy",
  ok: "bg-emerald-50 text-emerald-900",
  warn: "bg-amber-50 text-amber-900",
  error: "bg-red-50 text-red-800",
};

export function Notice({ tone = "info", title, children }: { tone?: Tone; title?: string; children?: React.ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={clsx("rounded-2xl px-4 py-3 text-sm font-semibold", NOTICE[tone])}>
      {title && <p className="font-extrabold">{title}</p>}
      {children}
    </div>
  );
}

/** Denetim sonuçları: hatalar (kaydı engeller) ve uyarılar (bakılması gerekenler). */
export function IssueList({ issues, level, title, limit = 12 }: { issues: Issue[]; level: Issue["level"]; title: string; limit?: number }) {
  const [all, setAll] = useState(false);
  const found = issues.filter((issue) => issue.level === level);
  if (!found.length) return null;
  const shown = all ? found : found.slice(0, limit);
  return (
    <Notice tone={level === "error" ? "error" : "warn"} title={`${title} (${found.length})`}>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {shown.map((issue, i) => (
          <li key={i}>
            {issue.path && <span className="font-extrabold">{issue.path}: </span>}
            {issue.message}
          </li>
        ))}
      </ul>
      {found.length > limit && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 font-extrabold underline">
          {all ? "Daha az göster" : `Hepsini göster (${found.length})`}
        </button>
      )}
    </Notice>
  );
}

/**
 * Geri alınamayan işlemler için iki adımlı düğme: ilk tıklama soruyu gösterir, ikincisi işlemi yapar.
 * Tarayıcının kendi onay penceresi kullanılmaz.
 */
export function ConfirmButton({
  label,
  question,
  confirmLabel,
  onConfirm,
  danger = false,
  quiet = false,
  disabled = false,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  danger?: boolean;
  /** Listelerdeki satırlar için: düğme yerine altı çizili yazı. */
  quiet?: boolean;
  disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  // Sayfadan çıkılıp dönüldüğünde soru açık kalmasın.
  useLayoutEffect(() => () => setAsking(false), []);

  if (!asking) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAsking(true)}
        className={quiet ? clsx("text-xs font-extrabold underline disabled:opacity-50", danger ? "text-red-700" : "text-navy-muted") : clsx("btn btn-sm", danger ? "btn-danger" : "btn-outline")}
      >
        {label}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2 rounded-2xl bg-navy-soft px-3 py-2">
      <span className="text-sm font-bold text-navy">{question}</span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            setBusy(false);
            setAsking(false);
          }
        }}
        className={clsx("btn btn-sm", danger ? "btn-danger" : "btn-primary")}
      >
        {busy ? "Bekle..." : confirmLabel}
      </button>
      <button type="button" disabled={busy} onClick={() => setAsking(false)} className="btn btn-outline btn-sm">
        Vazgeç
      </button>
    </span>
  );
}

export function Loading({ label = "Yükleniyor" }: { label?: string }) {
  return <div className="h-48 animate-pulse rounded-3xl bg-navy-soft" role="status" aria-label={label} />;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-navy-soft px-4 py-6 text-center font-semibold text-navy-muted">{children}</p>;
}
