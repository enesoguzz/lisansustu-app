import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

/** Sunucu tarafında oturumu okumak için. Bir <Suspense> sınırının içinde çağrılmalı. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Sunucu bileşeninden çağrıldıysa çerez yazılamaz; oturumu proxy yeniler.
        }
      },
    },
  });
}
