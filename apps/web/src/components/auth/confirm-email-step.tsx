"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth-errors";
import { returnUrl } from "@/lib/auth-link";
import { useAuth } from "./auth-provider";
import { CheckEmail } from "./check-email";

type Props = {
  email: string;
  password: string;
  /**
   * Kayıt formundan gelindiyse true. Bu e-postayla daha önce başlanıp yarım kalmış bir kayıt varsa
   * Supabase o kayıttaki şifreyi saklar, az önce yazılanı değil. Doğrulama linki bu tarayıcıda açılıp
   * oturum başladığında geçerli şifre az önce yazılan yapılır; eski şifre (kime ait olursa olsun) düşer.
   */
  adoptPassword?: boolean;
  /** Bu adıma gelinirken link gönderilemediyse nedeni. */
  sendError?: string;
};

/**
 * Kayıttan (ya da doğrulanmamış hesapla giriş denemesinden) sonraki adım.
 * Şifre yalnızca bu adım ekrandayken bellekte tutulur: link başka bir cihazda açılırsa
 * kullanıcı "Doğruladım, devam et" ile şifresini yeniden yazmadan giriş yapabilsin diye.
 */
export function ConfirmEmailStep({ email, password, adoptPassword = false, sendError }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  // Oturum bu adımdaki şifreyle açıldıysa şifre zaten doğrudur.
  const ownSignIn = useRef(false);
  const adopted = useRef(false);

  useEffect(() => {
    if (!adoptPassword || adopted.current || ownSignIn.current) return;
    if (user?.email !== email) return;
    adopted.current = true;
    // Şifre zaten aynıysa sunucu isteği reddeder; her iki durumda da yapılacak başka bir şey yok.
    createClient()
      .auth.updateUser({ password })
      .catch(() => {});
  }, [adoptPassword, user, email, password]);

  const resend = useCallback(async () => {
    const { error } = await createClient().auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: returnUrl("/dogrula") },
    });
    return authErrorMessage(error);
  }, [email]);

  const proceed = useCallback(async () => {
    ownSignIn.current = true;
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (!error) {
      router.replace("/hesabim");
      return "";
    }
    ownSignIn.current = false;
    if (error.code === "email_not_confirmed") {
      return "E-postan henüz doğrulanmamış görünüyor. E-postandaki linke tıkladıktan sonra tekrar dene.";
    }
    if (error.code === "invalid_credentials") {
      // Daha önce başka bir şifreyle başlanıp yarım kalmış kayıtlarda ilk şifre geçerli kalır. Sunucu şifreyi
      // e-postanın doğrulanıp doğrulanmadığından önce denetler; bu yanıt e-postanın doğrulandığını göstermez.
      return "Bu şifreyle giriş yapılamadı. E-postandaki linke henüz tıklamadıysan önce ona bu tarayıcıda tıkla. Tıkladıysan giriş sayfasındaki “Şifremi unuttum” ile yeni şifre belirleyebilirsin.";
    }
    return authErrorMessage(error);
  }, [email, password, router]);

  return (
    <CheckEmail onResend={resend} onContinue={proceed} initialError={sendError}>
      <strong className="font-extrabold wrap-anywhere">{email}</strong>{" "}
      {sendError
        ? "adresine yeni bir doğrulama linki gönderemedik. Daha önce gelen bir link varsa onu kullanabilirsin; linke tıkla, sonra bu sayfaya dön."
        : "adresine bir doğrulama linki gönderdik. Linke tıkla, sonra bu sayfaya dön."}
    </CheckEmail>
  );
}
