"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NOT_READY_MESSAGE, SUPABASE_CONFIGURED } from "@/lib/supabase/config";
import { authErrorMessage } from "@/lib/auth-errors";
import { normalizeEmail } from "@lisansustu/core";
import { AuthCard, Field, FormError, SubmitButton } from "./ui";
import { CodeStep } from "./code-step";

export function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "code">("form");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!SUPABASE_CONFIGURED) return setError(NOT_READY_MESSAGE);
    const form = new FormData(e.currentTarget);
    const mail = normalizeEmail(String(form.get("email")));
    const password = String(form.get("password"));
    if (!mail || !password) return setError("E-posta ve şifreni yaz.");

    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: mail, password });
    if (!error) {
      router.replace("/hesabim");
      return;
    }
    setPending(false);
    if (error.code === "email_not_confirmed") {
      // Kayıt yarım kalmış: yeni kod gönder ve doğrulama adımına geç.
      await supabase.auth.resend({ type: "signup", email: mail });
      setEmail(mail);
      setStep("code");
      return;
    }
    setError(authErrorMessage(error));
  }

  if (step === "code") {
    return (
      <AuthCard title="E-postanı doğrula" subtitle="Giriş yapmadan önce e-postanı doğrulaman gerekiyor.">
        <CodeStep
          email={email}
          onVerify={async (token) => {
            const { error } = await createClient().auth.verifyOtp({ email, token, type: "email" });
            if (error) return authErrorMessage(error);
            router.replace("/hesabim");
            return "";
          }}
          onResend={async () => {
            const { error } = await createClient().auth.resend({ type: "signup", email });
            return authErrorMessage(error);
          }}
        />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Tekrar hoş geldin" subtitle="Hesabına giriş yap.">
      <form onSubmit={submit} noValidate>
        <FormError message={error} />
        <Field label="E-posta" name="email" type="email" autoComplete="email" required />
        <Field label="Şifre" name="password" type="password" autoComplete="current-password" required />
        <div className="-mt-2 mb-5 text-right">
          <Link href="/sifremi-unuttum" className="text-sm font-bold text-navy underline">
            Şifremi unuttum
          </Link>
        </div>
        <SubmitButton pending={pending}>Giriş yap</SubmitButton>
      </form>
      <p className="mt-6 text-center font-semibold text-navy-muted">
        Hesabın yok mu?{" "}
        <Link href="/kayit" className="font-extrabold text-navy underline">
          Ücretsiz başla
        </Link>
      </p>
    </AuthCard>
  );
}
