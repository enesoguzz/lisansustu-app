"use client";

import { useId } from "react";
import clsx from "clsx";
import { Mascot } from "@/components/mascot";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-12">
      <Mascot className="h-24 w-24" />
      <h1 className="mt-4 text-center text-3xl font-black text-navy">{title}</h1>
      {subtitle && <p className="mt-2 text-center font-semibold text-navy-muted">{subtitle}</p>}
      <div className="mt-8 w-full">{children}</div>
    </section>
  );
}

/**
 * Üyelik formları. Gönderimi sayfanın kendi kodu karşılar; method="post" yalnızca bir önlemdir:
 * sayfa tam yüklenmeden gönderilirse tarayıcı alanları (şifre dahil) adres çubuğuna yazmasın.
 */
export function Form(props: React.FormHTMLAttributes<HTMLFormElement>) {
  return <form method="post" noValidate {...props} />;
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string };

export function Field({ label, hint, className, ...props }: FieldProps) {
  const id = useId();
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-sm font-extrabold text-navy">
        {label}
      </label>
      <input
        id={id}
        className={clsx(
          "w-full rounded-2xl border-2 border-navy-soft bg-white px-4 py-3 font-semibold text-navy outline-none transition-colors placeholder:text-navy-muted/50 focus:border-navy",
          className,
        )}
        {...props}
      />
      {hint && <p className="mt-1 text-xs font-semibold text-navy-muted">{hint}</p>}
    </div>
  );
}

export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
      {message}
    </p>
  );
}

export function FormInfo({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="status" className="mb-4 rounded-2xl bg-navy-soft px-4 py-3 text-sm font-bold text-navy">
      {message}
    </p>
  );
}

export function SubmitButton({ pending, disabled, children }: { pending: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={pending || disabled} className="btn btn-primary w-full disabled:opacity-60">
      {pending ? "Bekle..." : children}
    </button>
  );
}

/** Bir link işlenirken gösterilen bekleme ekranı. */
export function Working({ title }: { title: string }) {
  return (
    <AuthCard title={title} subtitle="Birkaç saniye sürebilir.">
      <div className="h-24 animate-pulse rounded-3xl bg-navy-soft" role="status" aria-label={title} />
    </AuthCard>
  );
}
