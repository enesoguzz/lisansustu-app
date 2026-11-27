/** Supabase hata kodlarını kullanıcıya gösterilecek Türkçe mesajlara çevirir. */
export function authErrorMessage(error: { code?: string; message?: string; status?: number } | null): string {
  if (!error) return "";
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
    case "validation_failed":
    case "email_address_invalid":
      return "Geçerli bir e-posta adresi gir.";
    default:
      return "Bir sorun oluştu. Lütfen tekrar dene.";
  }
}
