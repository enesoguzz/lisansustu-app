import { isAuthRetryableFetchError, isAuthSessionMissingError, type AuthError } from "@supabase/supabase-js";
import { RECOVERY_STORAGE_KEY, createRecoveryClient } from "./supabase/client";

/**
 * Şifre yenileme linkinin durumu.
 * - ready: link geçerli, `email` hesabının yeni şifresi belirlenebilir.
 * - invalid: link kullanılamıyor (süresi dolmuş, kullanılmış ya da bozuk).
 * - retry: sunucuya ulaşılamadı; link hâlâ geçerli olabilir, yeniden denenebilir.
 */
export type RecoveryOutcome = { state: "ready"; email: string } | { state: "invalid" } | { state: "retry" };

// Sayfa aynı linki iki kez işlemeye kalkarsa ikincisi ilkinin sonucunu bekler.
const attempts = new Map<string, Promise<RecoveryOutcome>>();

/**
 * Linkteki oturum bilgisini yalnızca bu sekmede duran ayrı bir oturuma çevirir (bkz. createRecoveryClient).
 * Sitenin asıl oturumuna dokunmaz.
 */
export function openRecovery(accessToken: string, refreshToken: string): Promise<RecoveryOutcome> {
  const key = `${accessToken} ${refreshToken}`;
  let attempt = attempts.get(key);
  if (!attempt) {
    attempt = start(accessToken, refreshToken).then((outcome) => {
      if (outcome.state === "retry") attempts.delete(key);
      return outcome;
    });
    attempts.set(key, attempt);
  }
  return attempt;
}

async function start(accessToken: string, refreshToken: string): Promise<RecoveryOutcome> {
  try {
    const { data, error } = await createRecoveryClient().auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) return { state: isAuthRetryableFetchError(error) ? "retry" : "invalid" };
    const email = data.session?.user.email;
    return email ? { state: "ready", email } : { state: "invalid" };
  } catch {
    return { state: "invalid" };
  }
}

/** Sayfa yenilendiyse: link bu sekmede daha önce açılmışsa kaldığı yerden devam eder. */
export async function resumeRecovery(): Promise<RecoveryOutcome> {
  try {
    const { data, error } = await createRecoveryClient().auth.getSession();
    const email = data.session?.user.email;
    if (email) return { state: "ready", email };
    return { state: error && isAuthRetryableFetchError(error) ? "retry" : "invalid" };
  } catch {
    return { state: "invalid" };
  }
}

/** Sunucunun "bu oturum artık yok" anlamına gelen yanıtları. */
const GONE = new Set(["session_not_found", "session_expired", "user_not_found", "user_banned", "bad_jwt", "no_authorization", "refresh_token_not_found", "refresh_token_already_used"]);

/**
 * Yeni şifreyi linkin ait olduğu hesaba kaydeder. O sırada sitede başka bir hesapla oturum açık olsa bile
 * şifresi değişen hesap, formda adı yazan hesaptır.
 * "saved": kaydedildi. "gone": linkin oturumu artık geçerli değil, yeni link gerekir. Diğer durumda hata döner.
 */
export async function saveRecoveredPassword(password: string): Promise<"saved" | "gone" | Pick<AuthError, "code" | "name">> {
  const recovery = createRecoveryClient();
  try {
    const { error } = await recovery.auth.updateUser({ password });
    if (!error) return "saved";
    if (isAuthSessionMissingError(error) || GONE.has(error.code ?? "")) {
      await closeRecovery();
      return "gone";
    }
    // Süresi dolan oturum yenilenemediyse istemci onu kendisi silmiştir.
    if (!isAuthRetryableFetchError(error) && !hasStoredRecovery()) return "gone";
    return error;
  } catch {
    return { code: undefined, name: "" };
  }
}

/** Bu sekmede saklı bir şifre yenileme oturumu var mı? */
function hasStoredRecovery(): boolean {
  try {
    return window.sessionStorage.getItem(RECOVERY_STORAGE_KEY) !== null;
  } catch {
    // Depolama kapalıysa oturum yalnızca bellekte durur; var sayılır.
    return true;
  }
}

/** Sekmedeki şifre yenileme oturumunu kapatır; sunucudaki karşılığı da iptal edilir. */
export async function closeRecovery(): Promise<void> {
  try {
    await createRecoveryClient().auth.signOut({ scope: "local" });
  } catch {}
  try {
    window.sessionStorage.removeItem(RECOVERY_STORAGE_KEY);
  } catch {}
}
