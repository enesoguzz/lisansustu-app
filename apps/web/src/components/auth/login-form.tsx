"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NOT_READY_MESSAGE, SUPABASE_CONFIGURED } from "@/lib/supabase/config";
import { authErrorMessage } from "@/lib/auth-errors";
import { returnUrl } from "@/lib/auth-link";
import { normalizeEmail } from "@lisansustu/core";
import { useAuth } from "./auth-provider";
import { AuthCard, Field, Form, FormError, SubmitButton } from "./ui";
import { ConfirmEmailStep } from "./confirm-email-step";
import { GoogleButton } from "./google-button";

export function LoginForm() {
  const router = useRouter();
  const { user } = useAuth();
  const [waiting, setWaiting] = useState<{ email: string; password: string; sendError: string } | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  // Zaten giriş yapılmışsa ya da doğrulama linki başka bir sekmede açılıp oturum başladıysa hesaba geç.
  useEffect(() => {
    if (user) router.replace("/hesabim");
  }, [user, router]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!SUPABASE_CONFIGURED) return setError(NOT_READY_MESSAGE);
    const form = new FormData(e.currentTarget);
    const email = normalizeEmail(String(form.get("email")));
    const password = String(form.get("password"));
    if (!email || !password) return setError("E-posta ve şifreni yaz.");

    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      router.replace("/hesabim");
      return;
    }
    if (error.code === "email_not_confirmed") {
      // Kayıt yarım kalmış: yeni doğrulama linki gönder ve bekleme adımına geç.
      const sent = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: returnUrl("/dogrula") } });
      setPending(false);
      setWaiting({ email, password, sendError: authErrorMessage(sent.error) });
      return;
    }
    setPending(false);
    setError(
      error.code === "invalid_credentials"
        ? "E-posta ya da şifre hatalı. Google ile kayıt olduysan “Google ile devam et”i kullan."
        : authErrorMessage(error),
    );
  }

  if (waiting) {
    return (
      <AuthCard title="E-postanı kontrol et" subtitle="Giriş yapmadan önce e-postanı doğrulaman gerekiyor.">
        <ConfirmEmailStep email={waiting.email} password={waiting.password} sendError={waiting.sendError} />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Tekrar hoş geldin" subtitle="Hesabına giriş yap.">
      <GoogleButton />
      <Form onSubmit={submit}>
        <Field label="E-posta" name="email" type="email" autoComplete="email" required />
        <Field label="Şifre" name="password" type="password" autoComplete="current-password" required />
        <div className="-mt-2 mb-5 text-right">
          <Link href="/sifremi-unuttum" className="text-sm font-bold text-navy underline">
            Şifremi unuttum
          </Link>
        </div>
        <FormError message={error} />
        <SubmitButton pending={pending}>Giriş yap</SubmitButton>
      </Form>
      <p className="mt-6 text-center font-semibold text-navy-muted">
        Hesabın yok mu?{" "}
        <Link href="/kayit" className="font-extrabold text-navy underline">
          Ücretsiz başla
        </Link>
      </p>
    </AuthCard>
  );
}
