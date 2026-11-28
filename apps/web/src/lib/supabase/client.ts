import { createBrowserClient } from "@supabase/ssr";
import { createClient as createPlainClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    // E-postadaki linkten ve Google'dan dönüşleri ilgili sayfalar kendisi işler (lib/auth-link.ts).
    auth: { detectSessionInUrl: false },
    // Oturum çerezi yalnızca şifreli bağlantıda gönderilsin (yerelde http ile çalışırken bu koşul aranmaz).
    cookieOptions: { secure: typeof window !== "undefined" && window.location.protocol === "https:" },
  });
}

let mailClient: SupabaseClient | undefined;

/**
 * Yalnızca şifre yenileme e-postası istemek için kullanılır; oturum tutmaz.
 *
 * Ana istemci, gönderdiği linki isteğin yapıldığı tarayıcıya bağlar (PKCE): link başka bir
 * cihazda ya da e-posta uygulamasının kendi tarayıcısında açılırsa oturum açılamaz.
 * Şifresini unutan kişi şifresiyle giriş de yapamayacağı için bu istek o bağ olmadan gönderilir.
 */
export function createMailClient() {
  mailClient ??= createPlainClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      flowType: "implicit",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: "sb-eposta-istegi",
    },
  });
  return mailClient;
}

/** Şifre yenileme oturumunun bu sekmede saklandığı anahtar. */
export const RECOVERY_STORAGE_KEY = "sb-sifre-yenileme";

/** Sekmeye özel depolama; tarayıcı izin vermiyorsa yalnızca sayfa açık kaldıkça bellekte tutulur. */
const memory = new Map<string, string>();
const tabStorage = {
  getItem(key: string) {
    try {
      const value = window.sessionStorage.getItem(key);
      if (value !== null) return value;
    } catch {}
    return memory.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    try {
      window.sessionStorage.setItem(key, value);
    } catch {
      memory.set(key, value);
    }
  },
  removeItem(key: string) {
    memory.delete(key);
    try {
      window.sessionStorage.removeItem(key);
    } catch {}
  },
};

let recoveryClient: SupabaseClient | undefined;

/**
 * Şifre yenileme linkindeki oturum için ayrı istemci.
 *
 * Linkteki oturum bilgisi sitenin asıl oturumuna (çerezlere) yazılmaz. Yazılsaydı, başkasının hazırladığı
 * bir link onu açan kişiyi habersizce link sahibinin hesabına sokabilir, açık olan kendi oturumunu da silerdi.
 * Bu oturum yalnızca linkin açıldığı sekmede durur (sekme kapanınca silinir) ve yalnızca o hesabın
 * yeni şifresini kaydetmek için kullanılır.
 */
export function createRecoveryClient() {
  recoveryClient ??= createPlainClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      flowType: "implicit",
      persistSession: true,
      storage: tabStorage,
      storageKey: RECOVERY_STORAGE_KEY,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return recoveryClient;
}
