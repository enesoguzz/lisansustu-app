"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth-errors";
import { clearLinkParams, hasSession, readLinkParams, signInWithCode, signInWithTokens } from "@/lib/auth-link";
import { MIN_PASSWORD } from "@lisansustu/core";
import { AuthCard, Field, Form, FormError, SubmitButton, Working } from "./ui";

/** Sayfa yenilenirse form kaybolmasın diye, linkin bu sekmede açıldığı sekme kapanana kadar hatırlanır. */
const MARK = "sifre-yenileme";

function mark(on: boolean) {
  try {
    if (on) window.sessionStorage.setItem(MARK, "1");
    else window.sessionStorage.removeItem(MARK);
  } catch {
    // Tarayıcı depolamaya izin vermiyorsa yalnızca "yenileyince form kaybolur"; akış yine çalışır.
  }
}

function marked() {
  try {
    return window.sessionStorage.getItem(MARK) === "1";
  } catch {
    return false;
  }
}

/** Şifre yenileme e-postasındaki linkin açıldığı sayfa: linki doğrular, yeni şifreyi alır. */
export function ResetLanding() {
  const router = useRouter();
  const [state, setState] = useState<"working" | "form" | "invalid">("working");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    const params = readLinkParams(window.location.href);
    (async () => {
      let ok: boolean;
      if (params.accessToken && params.refreshToken) ok = await signInWithTokens(params.accessToken, params.refreshToken);
      else if (params.code) ok = await signInWithCode(params.code);
      else ok = !params.error && marked() && (await hasSession());
      const { data } = await createClient().auth.getSession();
      if (!active) return;
      if (params.code || params.accessToken || params.error) clearLinkParams();
      mark(ok);
      setEmail(data.session?.user.email ?? "");
      setState(ok ? "form" : "invalid");
    })();
    return () => {
      active = false;
    };
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
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
    mark(false);
    router.replace("/hesabim");
  }

  if (state === "working") return <Working title="Link kontrol ediliyor" />;

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
    <AuthCard title="Yeni şifreni belirle" subtitle={email || undefined}>
      <Form onSubmit={submit}>
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
