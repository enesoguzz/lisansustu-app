"use client";

import { useEffect, useState } from "react";
import { Field, FormError, FormInfo, SubmitButton } from "./ui";
import { OTP_LENGTH } from "@/lib/auth-config";

const RESEND_WAIT = 60;

type Props = {
  email: string;
  /** Kodu doğrular; hata varsa mesajını döndürür. */
  onVerify: (code: string) => Promise<string>;
  onResend: () => Promise<string>;
};

export function CodeStep({ email, onVerify, onResend }: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [pending, setPending] = useState(false);
  const [wait, setWait] = useState(RESEND_WAIT);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setPending(true);
    const message = await onVerify(code);
    if (message) {
      setError(message);
      setPending(false);
    }
  }

  async function resend() {
    setError("");
    setInfo("");
    setWait(RESEND_WAIT);
    const message = await onResend();
    if (message) setError(message);
    else setInfo("Yeni kod gönderildi.");
  }

  return (
    <form onSubmit={submit} noValidate>
      <FormInfo message={info || `${email} adresine ${OTP_LENGTH} haneli bir kod gönderdik. Gelmediyse spam klasörüne de bak.`} />
      <FormError message={error} />
      <Field
        label="Doğrulama kodu"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={OTP_LENGTH}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        className="text-center text-2xl tracking-[0.5em]"
        autoFocus
        required
      />
      <SubmitButton pending={pending} disabled={code.length !== OTP_LENGTH}>Doğrula</SubmitButton>
      <button
        type="button"
        onClick={resend}
        disabled={wait > 0}
        className="mt-4 w-full text-center text-sm font-bold text-navy disabled:text-navy-muted"
      >
        {wait > 0 ? `Yeni kod için ${wait} sn bekle` : "Kodu tekrar gönder"}
      </button>
    </form>
  );
}
