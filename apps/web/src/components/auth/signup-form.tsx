"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NOT_READY_MESSAGE, SUPABASE_CONFIGURED } from "@/lib/supabase/config";
import { authErrorMessage } from "@/lib/auth-errors";
import { MIN_PASSWORD, normalizePhone } from "@/lib/auth-config";
import { AuthCard, Field, FormError, SubmitButton } from "./ui";
import { CodeStep } from "./code-step";

export function SignupForm() {
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
    const mail = String(form.get("email")).trim().toLowerCase();
    const password = String(form.get("password"));
    const phone = normalizePhone(String(form.get("phone")));
    const school = String(form.get("school")).trim();
    const fullName = String(form.get("full_name")).trim();

    if (!fullName) return setError("Adını ve soyadını yaz.");
    if (!/^\S+@\S+\.\S+$/.test(mail)) return setError("Geçerli bir e-posta adresi gir.");
    if (password.length < MIN_PASSWORD) return setError(`Şifre en az ${MIN_PASSWORD} karakter olmalı.`);
    if (!phone) return setError("Telefon numaranı 05xx xxx xx xx biçiminde yaz.");
    if (!form.get("consent")) return setError("Devam etmek için aydınlatma metnini onaylaman gerekiyor.");

    setPending(true);
    const { data, error } = await createClient().auth.signUp({
      email: mail,
      password,
      options: { data: { full_name: fullName, phone, school } },
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
    setEmail(mail);
    setStep("code");
  }

  if (step === "code") {
    return (
      <AuthCard title="E-postanı doğrula" subtitle="Son bir adım kaldı.">
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
    <AuthCard title="Ücretsiz hesap oluştur" subtitle="Puanlarını kaydet, sana özel önerileri gör.">
      <form onSubmit={submit} noValidate>
        <FormError message={error} />
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
        <label className="mb-5 flex items-start gap-3 text-sm font-semibold text-navy-muted">
          <input type="checkbox" name="consent" className="mt-1 h-4 w-4 accent-navy" />
          <span>
            <Link href="/kvkk" className="font-bold text-navy underline" target="_blank">
              KVKK Aydınlatma Metni
            </Link>
            &apos;ni okudum, bilgilerimin üyelik için işlenmesini kabul ediyorum.
          </span>
        </label>
        <SubmitButton pending={pending}>Hesap oluştur</SubmitButton>
      </form>
      <p className="mt-6 text-center font-semibold text-navy-muted">
        Zaten üye misin?{" "}
        <Link href="/giris" className="font-extrabold text-navy underline">
          Giriş yap
        </Link>
      </p>
    </AuthCard>
  );
}
