import { hasNonAsciiLetter } from "@lisansustu/core";

export const CONNECTION_MESSAGE = "Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.";
export const PASSWORD_TOO_LONG_MESSAGE = "Şifre çok uzun. En fazla 72 karakter olabilir; Türkçe harfler iki karakter sayılır.";

/** Biçimi geçersiz bir e-posta adresi için gösterilecek uyarı. */
export function invalidEmailMessage(email: string): string {
  return hasNonAsciiLetter(email) ? "E-posta adresinde Türkçe harf (ç, ğ, ı, ö, ş, ü) olamaz." : "Geçerli bir e-posta adresi gir.";
}

/** Supabase hata kodlarını kullanıcıya gösterilecek Türkçe mesajlara çevirir. */
export function authErrorMessage(error: { code?: string; name?: string } | null): string {
  if (!error) return "";
  // İstek sunucuya ulaşmadı ya da sunucu geçici olarak yanıt veremedi.
  if (error.name === "AuthRetryableFetchError") return CONNECTION_MESSAGE;
  switch (error.code) {
    case "invalid_credentials":
      return "E-posta ya da şifre hatalı.";
    case "email_not_confirmed":
      return "E-posta adresin henüz doğrulanmamış.";
    case "user_already_exists":
    case "email_exists":
      return "Bu e-posta ile zaten bir hesap var. Giriş yapmayı dene.";
    case "weak_password":
      return "Şifre çok zayıf. En az 8 karakter kullan.";
    case "otp_expired":
      return "Linkin süresi dolmuş ya da link daha önce kullanılmış. Yenisini isteyebilirsin.";
    case "over_email_send_rate_limit":
      return "Çok sık e-posta istendi. Biraz bekleyip tekrar dene.";
    case "over_request_rate_limit":
      return "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene.";
    case "email_address_not_authorized":
      // Supabase'in kendi e-posta servisi yalnızca proje ekibindeki adreslere gönderir (bkz. supabase/README.md).
      return "Kayıtlar henüz herkese açık değil. Çok yakında açılacak.";
    case "same_password":
      return "Yeni şifren eskisiyle aynı olamaz.";
    case "email_address_invalid":
      return "Geçerli bir e-posta adresi gir.";
    case "validation_failed":
      // Sunucu bu kodu birden fazla alan için kullanır; hangi alan olduğunu söylemez.
      return "Girdiğin bilgiler kabul edilmedi. Kontrol edip tekrar dene.";
    default:
      return "Bir sorun oluştu. Lütfen tekrar dene.";
  }
}
