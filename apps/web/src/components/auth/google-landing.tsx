"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearLinkParams, hasSession, readLinkParams, signInWithCode } from "@/lib/auth-link";
import { AuthCard, Working } from "./ui";

/** Google'dan dönüş sayfası. Oturum açılınca hesap sayfasına geçer; eksik bilgiler orada tamamlanır. */
export function GoogleLanding() {
  const router = useRouter();
  const [failed, setFailed] = useState<"" | "cancelled" | "error">("");

  useEffect(() => {
    let active = true;
    const params = readLinkParams(window.location.href);
    (async () => {
      const signedIn = (params.code !== null && (await signInWithCode(params.code))) || (await hasSession());
      if (!active) return;
      if (signedIn) return router.replace("/hesabim");
      if (!params.code && !params.error) return router.replace("/giris");
      setFailed(params.cancelled ? "cancelled" : "error");
      clearLinkParams();
    })();
    return () => {
      active = false;
    };
  }, [router]);

  if (!failed) return <Working title="Google ile giriş yapılıyor" />;

  return (
    <AuthCard
      title="Giriş tamamlanamadı"
      subtitle={
        failed === "cancelled"
          ? "Google ekranında giriş tamamlanmadı."
          : "Google ile giriş sırasında bir sorun oluştu."
      }
    >
      <Link href="/giris" className="btn btn-primary w-full">
        Tekrar dene
      </Link>
    </AuthCard>
  );
}
