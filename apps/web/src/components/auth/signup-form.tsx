"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NOT_READY_MESSAGE, SUPABASE_CONFIGURED } from "@/lib/supabase/config";
import { PASSWORD_TOO_LONG_MESSAGE, authErrorMessage, invalidEmailMessage } from "@/lib/auth-errors";
import { returnUrl } from "@/lib/auth-link";
import { MIN_PASSWORD, isPasswordTooLong, isValidEmail, normalizeEmail, normalizePhone } from "@lisansustu/core";
import { useAuth } from "./auth-provider";
import { AuthCard, Field, Form, FormError, SubmitButton } from "./ui";
import { ConfirmEmailStep } from "./confirm-email-step";
import { GoogleButton } from "./google-button";
import { KvkkConsent } from "./kvkk-consent";

export function SignupForm() {
  const router = useRouter();
  const { user } = useAuth();
  const [waiting, setWaiting] = useState<{ email: string; password: string } | null>(null);
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
    const phone = normalizePhone(String(form.get("phone")));
    const school = String(form.get("school")).trim();
    const fullName = String(form.get("full_name")).trim();

    if (!fullName) return setError("Adını ve soyadını yaz.");
    if (!isValidEmail(email)) return setError(invalidEmailMessage(email));
    if (password.length < MIN_PASSWORD) return setError(`Şifre en az ${MIN_PASSWORD} karakter olmalı.`);
    if (isPasswordTooLong(password)) return setError(PASSWORD_TOO_LONG_MESSAGE);
    if (!phone) return setError("Telefon numaranı 05xx xxx xx xx biçiminde yaz.");
    if (!form.get("consent")) return setError("Devam etmek için aydınlatma metnini onaylaman gerekiyor.");

    setPending(true);
    const { data, error } = await createClient().auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: returnUrl("/dogrula"),
        data: { full_name: fullName, phone, school, kvkk_accepted: true },
      },
    });
    setPending(false);

    if (error) return setError(authErrorMessage(error));
    // Supabase, kayıtlı bir e-posta için güvenlik gereği sahte bir kullanıcı döndürür.
    if (data.user && data.user.identities?.length === 0) {
      return setError("Bu e-posta ile zaten bir hesap var. Giriş yapmayı dene.");
    }
    if (data.session) {
      router.replace("/hesabim");
      return;
    }
    setWaiting({ email, password });
  }

  if (waiting) {
    return (
      <AuthCard title="E-postanı kontrol et" subtitle="Son bir adım kaldı.">
        <ConfirmEmailStep email={waiting.email} password={waiting.password} adoptPassword />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Ücretsiz hesap oluştur" subtitle="Puanlarını kaydet, sana özel önerileri gör.">
      <GoogleButton />
      <Form onSubmit={submit}>
        <Field label="Ad Soyad" name="full_name" autoComplete="name" maxLength={120} required />
        <Field label="E-posta" name="email" type="email" autoComplete="email" required />
        <Field
          label="Şifre"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          hint={`En az ${MIN_PASSWORD} karakter.`}
          required
        />
        <Field label="Telefon" name="phone" type="tel" autoComplete="tel" placeholder="05xx xxx xx xx" required />
        <Field
          label="Okuduğun ya da mezun olduğun üniversite"
          name="school"
          autoComplete="organization"
          maxLength={160}
          hint="İstersen boş bırakabilirsin."
        />
        <KvkkConsent />
        <FormError message={error} />
        <SubmitButton pending={pending}>Hesap oluştur</SubmitButton>
      </Form>
      <p className="mt-6 text-center font-semibold text-navy-muted">
        Zaten üye misin?{" "}
        <Link href="/giris" className="font-extrabold text-navy underline">
          Giriş yap
        </Link>
      </p>
    </AuthCard>
  );
}
