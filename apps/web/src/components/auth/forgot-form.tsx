"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { createMailClient } from "@/lib/supabase/client";
import { NOT_READY_MESSAGE, SUPABASE_CONFIGURED } from "@/lib/supabase/config";
import { authErrorMessage, invalidEmailMessage } from "@/lib/auth-errors";
import { returnUrl } from "@/lib/auth-link";
import { isValidEmail, normalizeEmail } from "@lisansustu/core";
import { AuthCard, Field, Form, FormError, SubmitButton } from "./ui";
import { CheckEmail } from "./check-email";

async function sendLink(email: string) {
  const { error } = await createMailClient().auth.resetPasswordForEmail(email, { redirectTo: returnUrl("/sifre-yenile") });
  return authErrorMessage(error);
}

export function ForgotForm() {
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!SUPABASE_CONFIGURED) return setError(NOT_READY_MESSAGE);
    const email = normalizeEmail(String(new FormData(e.currentTarget).get("email")));
    if (!isValidEmail(email)) return setError(invalidEmailMessage(email));
    setPending(true);
    const message = await sendLink(email);
    setPending(false);
    if (message) return setError(message);
    setSentTo(email);
  }

  const resend = useCallback(() => sendLink(sentTo), [sentTo]);

  if (sentTo) {
    return (
      <AuthCard title="E-postanı kontrol et" subtitle="Şifreni e-postandaki linkle yenileyeceksin.">
        <CheckEmail onResend={resend}>
          Bu adresle bir hesap varsa <strong className="font-extrabold wrap-anywhere">{sentTo}</strong> adresine şifre yenileme
          linki gönderdik. Linke tıklayıp yeni şifreni belirleyebilirsin.
        </CheckEmail>
        <p className="mt-6 text-center">
          <Link href="/giris" className="font-extrabold text-navy underline">
            Girişe dön
          </Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Şifreni mi unuttun?" subtitle="E-postanı yaz, sana şifre yenileme linki gönderelim.">
      <Form onSubmit={submit}>
        <Field label="E-posta" name="email" type="email" autoComplete="email" required />
        <FormError message={error} />
        <SubmitButton pending={pending}>Link gönder</SubmitButton>
      </Form>
      <p className="mt-6 text-center">
        <Link href="/giris" className="font-extrabold text-navy underline">
          Girişe dön
        </Link>
      </p>
    </AuthCard>
  );
}
