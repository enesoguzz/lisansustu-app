import { createClient } from "./supabase/client";

/** E-postadaki linke tıklanınca ya da Google'dan dönülünce adrese eklenen bilgiler. */
export type LinkParams = {
  /** Oturuma çevrilecek tek kullanımlık kod. */
  code: string | null;
  /** Oturum bilgisi doğrudan adreste geldiyse. */
  accessToken: string | null;
  refreshToken: string | null;
  /** Link geçersizse, süresi dolmuşsa ya da işlem tamamlanmadıysa dolu gelir. */
  error: string | null;
  /** Kullanıcı Google ekranında vazgeçtiyse. */
  cancelled: boolean;
};

/** Bilgiler adresin soru işaretinden sonraki ya da # işaretinden sonraki kısmında gelebilir. */
export function readLinkParams(href: string): LinkParams {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const get = (key: string) => url.searchParams.get(key) || hash.get(key) || null;
  const error = get("error");
  const errorCode = get("error_code");
  return {
    code: get("code"),
    accessToken: get("access_token"),
    refreshToken: get("refresh_token"),
    error: errorCode || error || get("error_description"),
    // Supabase kendi hatalarında ayrıca bir hata kodu gönderir; Google'dan gelen vazgeçmede kod olmaz.
    cancelled: error === "access_denied" && !errorCode,
  };
}

/** Kod ve oturum bilgisi adres çubuğunda ve tarayıcı geçmişinde kalmasın. */
export function clearLinkParams() {
  // İlk değer bilerek null: Next.js kendi yönlendirici durumunu ekleyip yeni adresi öğrenir.
  window.history.replaceState(null, "", window.location.pathname);
}

// Kod tek kullanımlıktır; sayfa aynı kodu iki kez işlemeye kalkarsa ikincisi ilkinin sonucunu bekler.
const attempts = new Map<string, Promise<boolean>>();

function once(key: string, run: () => Promise<{ error: unknown }>): Promise<boolean> {
  let attempt = attempts.get(key);
  if (!attempt) {
    attempt = run().then(
      ({ error }) => !error,
      () => false,
    );
    attempts.set(key, attempt);
  }
  return attempt;
}

/** Linkteki kodu oturuma çevirir. Link başka bir tarayıcıda açıldıysa ya da kod kullanılmışsa false döner. */
export function signInWithCode(code: string): Promise<boolean> {
  return once(`kod:${code}`, () => createClient().auth.exchangeCodeForSession(code));
}

/** Adreste gelen oturum bilgisini sunucuya doğrulatıp oturum açar. */
export function signInWithTokens(accessToken: string, refreshToken: string): Promise<boolean> {
  return once(`oturum:${accessToken}`, () =>
    createClient().auth.setSession({ access_token: accessToken, refresh_token: refreshToken }),
  );
}

/** Oturum açıkken true döner. */
export async function hasSession(): Promise<boolean> {
  const { data } = await createClient().auth.getSession();
  return data.session !== null;
}

/** E-postadaki linkin ya da Google'ın kullanıcıyı geri getireceği adres (sitenin o anki alan adında). */
export function returnUrl(path: "/dogrula" | "/sifre-yenile" | "/giris/google"): string {
  return `${window.location.origin}${path}`;
}
