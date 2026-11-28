"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearLinkParams, hasSession, readLinkParams, signInWithCode } from "@/lib/auth-link";
import { AuthCard, Working } from "./ui";

/**
 * Kayıt e-postasındaki linkin açıldığı sayfa.
 * Link kayıt olunan tarayıcıda açıldıysa oturum hemen açılır. Başka bir cihazda ya da e-posta
 * uygulamasının kendi tarayıcısında açıldıysa e-posta yine doğrulanmıştır; kullanıcı giriş yapar.
 */
export function ConfirmLanding() {
  const router = useRouter();
  const [state, setState] = useState<"working" | "verified" | "invalid">("working");

  useEffect(() => {
    let active = true;
    const params = readLinkParams(window.location.href);
    (async () => {
      const signedIn = (params.code !== null && (await signInWithCode(params.code))) || (await hasSession());
      if (!active) return;
      if (signedIn) return router.replace("/hesabim");
      if (params.error) setState("invalid");
      else if (params.code || params.accessToken) setState("verified");
      else return router.replace("/giris");
      clearLinkParams();
    })();
    return () => {
      active = false;
    };
  }, [router]);

  if (state === "working") return <Working title="E-postan doğrulanıyor" />;

  if (state === "verified") {
    return (
      <AuthCard title="E-postan doğrulandı" subtitle="Hesabın hazır, şimdi giriş yapabilirsin.">
        <Link href="/giris" className="btn btn-primary w-full">
          Giriş yap
        </Link>
        <p className="mt-4 text-center text-sm font-semibold text-navy-muted">
          Kayıt olduğun sayfa hâlâ açıksa oraya dönmen de yeterli, kaldığın yerden devam edersin.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Bu link kullanılamıyor" subtitle="Linkin süresi dolmuş ya da link daha önce kullanılmış.">
      <p className="mb-6 rounded-3xl bg-navy-soft px-5 py-5 text-center font-semibold text-navy">
        E-postan doğrulanmış olabilir. Giriş yapmayı dene; doğrulama gerekiyorsa sana yeni bir link göndeririz.
      </p>
      <Link href="/giris" className="btn btn-primary w-full">
        Giriş yap
      </Link>
    </AuthCard>
  );
}
