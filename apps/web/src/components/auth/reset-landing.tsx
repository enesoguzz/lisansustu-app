"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CONNECTION_MESSAGE, PASSWORD_TOO_LONG_MESSAGE, authErrorMessage } from "@/lib/auth-errors";
import { clearLinkParams, readLinkParams } from "@/lib/auth-link";
import { closeRecovery, openRecovery, resumeRecovery, saveRecoveredPassword, type RecoveryOutcome } from "@/lib/recovery";
import { MIN_PASSWORD, isPasswordTooLong } from "@lisansustu/core";
import { AuthCard, Field, Form, FormError, SubmitButton, Working } from "./ui";

/**
 * Şifre yenileme e-postasındaki linkin açıldığı sayfa: linki doğrular, yeni şifreyi alır.
 *
 * Linkteki oturum sitenin asıl oturumuna yazılmaz; yalnızca bu sekmede durur ve yalnızca yeni şifreyi
 * kaydetmek için kullanılır (lib/recovery.ts). Asıl oturum, kullanıcı yeni şifresini kaydettikten sonra
 * o şifreyle açılır. Böylece link her cihazda çalışır ama kimse hazırladığı bir linkle başkasının
 * tarayıcısındaki oturumu değiştiremez.
 */
export function ResetLanding() {
  const router = useRouter();
  const [state, setState] = useState<"working" | "form" | "invalid" | "retry" | "saved">("working");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const params = readLinkParams(window.location.href);
    (async () => {
      let outcome: RecoveryOutcome;
      if (params.accessToken && params.refreshToken) outcome = await openRecovery(params.accessToken, params.refreshToken);
      else if (params.error) outcome = { state: "invalid" };
      // Link yoksa: sayfa yenilenmiş olabilir; bu sekmede daha önce açılan link kaldığı yerden sürer.
      else outcome = await resumeRecovery();
      if (!active) return;
      // Sunucuya ulaşılamadıysa link adreste kalır; "Tekrar dene" de sayfayı yenilemek de aynı linki dener.
      if (outcome.state !== "retry" && (window.location.search || window.location.hash)) clearLinkParams();
      if (outcome.state === "ready") setEmail(outcome.email);
      setState(outcome.state === "ready" ? "form" : outcome.state);
    })();
    return () => {
      active = false;
    };
  }, [attempt]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const password = String(new FormData(e.currentTarget).get("password"));
    if (password.length < MIN_PASSWORD) return setError(`Şifre en az ${MIN_PASSWORD} karakter olmalı.`);
    if (isPasswordTooLong(password)) return setError(PASSWORD_TOO_LONG_MESSAGE);
    setPending(true);
    const result = await saveRecoveredPassword(password);
    if (result === "gone") {
      setPending(false);
      return setState("invalid");
    }
    if (result !== "saved") {
      setPending(false);
      return setError(authErrorMessage(result));
    }
    // Şifre kaydedildi. Sitenin oturumu, ekranda adı yazan hesapla ve az önce yazılan şifreyle açılır.
    const signIn = await createClient()
      .auth.signInWithPassword({ email, password })
      .catch(() => ({ error: true }));
    await closeRecovery();
    if (signIn.error) {
      setPending(false);
      return setState("saved");
    }
    router.replace("/hesabim");
  }

  if (state === "working") return <Working title="Link kontrol ediliyor" />;

  if (state === "retry") {
    return (
      <AuthCard title="Link kontrol edilemedi" subtitle={CONNECTION_MESSAGE}>
        <button
          type="button"
          className="btn btn-primary w-full"
          onClick={() => {
            setState("working");
            setAttempt((n) => n + 1);
          }}
        >
          Tekrar dene
        </button>
      </AuthCard>
    );
  }

  if (state === "saved") {
    return (
      <AuthCard title="Şifren değişti" subtitle="Yeni şifrenle giriş yapabilirsin.">
        <Link href="/giris" className="btn btn-primary w-full">
          Giriş yap
        </Link>
      </AuthCard>
    );
  }

  if (state === "invalid") {
    return (
      <AuthCard title="Bu link kullanılamıyor" subtitle="Linkin süresi dolmuş ya da link daha önce kullanılmış.">
        <Link href="/sifremi-unuttum" className="btn btn-primary w-full">
          Yeni link iste
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Yeni şifreni belirle"
      subtitle={
        <>
          <strong className="font-extrabold wrap-anywhere text-navy">{email}</strong> hesabının yeni şifresini belirliyorsun.
        </>
      }
    >
      <Form onSubmit={submit}>
        {/* Şifre yöneticileri yeni şifreyi doğru hesaba kaydetsin diye; ekranda görünmez. */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly className="hidden" />
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
        <FormError message={error} />
        <SubmitButton pending={pending}>Şifreyi kaydet</SubmitButton>
      </Form>
    </AuthCard>
  );
}
