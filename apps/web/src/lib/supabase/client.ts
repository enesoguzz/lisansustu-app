import { createBrowserClient } from "@supabase/ssr";
import { createClient as createPlainClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    // E-postadaki linkten ve Google'dan dönüşleri ilgili sayfalar kendisi işler (lib/auth-link.ts).
    auth: { detectSessionInUrl: false },
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
