"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NOT_READY_MESSAGE, SUPABASE_CONFIGURED } from "@/lib/supabase/config";
import { authErrorMessage } from "@/lib/auth-errors";
import { MIN_PASSWORD, isValidEmail, normalizeEmail } from "@lisansustu/core";
import { AuthCard, Field, FormError, SubmitButton } from "./ui";
import { CodeStep } from "./code-step";

export function ForgotForm() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code" | "password">("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function sendCode(mail: string) {
    const { error } = await createClient().auth.resetPasswordForEmail(mail);
    return authErrorMessage(error);
  }

  async function submitEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!SUPABASE_CONFIGURED) return setError(NOT_READY_MESSAGE);
    const mail = normalizeEmail(String(new FormData(e.currentTarget).get("email")));
    if (!isValidEmail(mail)) return setError("Geçerli bir e-posta adresi gir.");
    setPending(true);
    const message = await sendCode(mail);
    setPending(false);
    if (message) return setError(message);
    setEmail(mail);
    setStep("code");
  }

  async function submitPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const password = String(new FormData(e.currentTarget).get("password"));
    if (password.length < MIN_PASSWORD) return setError(`Şifre en az ${MIN_PASSWORD} karakter olmalı.`);
    setPending(true);
    const { error } = await createClient().auth.updateUser({ password });
    if (error) {
      setPending(false);
      return setError(authErrorMessage(error));
    }
    router.replace("/hesabim");
  }

  if (step === "code") {
    return (
      <AuthCard title="Kodu gir" subtitle="Hesap sana aitse e-postana bir kod gönderdik.">
        <CodeStep
          email={email}
          onVerify={async (token) => {
            const { error } = await createClient().auth.verifyOtp({ email, token, type: "recovery" });
            if (error) return authErrorMessage(error);
            setStep("password");
            return "";
          }}
          onResend={() => sendCode(email)}
        />
      </AuthCard>
    );
  }

  if (step === "password") {
    return (
      <AuthCard title="Yeni şifreni belirle">
        <form onSubmit={submitPassword} noValidate>
          <FormError message={error} />
          <Field
            label="Yeni şifre"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            hint={`En az ${MIN_PASSWORD} karakter.`}
            autoFocus
            required
          />
          <SubmitButton pending={pending}>Şifreyi kaydet</SubmitButton>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Şifreni mi unuttun?" subtitle="E-postanı yaz, sana bir doğrulama kodu gönderelim.">
      <form onSubmit={submitEmail} noValidate>
        <FormError message={error} />
        <Field label="E-posta" name="email" type="email" autoComplete="email" required />
        <SubmitButton pending={pending}>Kod gönder</SubmitButton>
      </form>
      <p className="mt-6 text-center">
        <Link href="/giris" className="font-extrabold text-navy underline">
          Girişe dön
        </Link>
      </p>
    </AuthCard>
  );
}
