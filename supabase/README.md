# Supabase kurulumu

Veritabanı ve üyelik Supabase üzerinde çalışır. Supabase CLI kullanılmıyor; aşağıdaki adımlar panelden elle uygulanır.

## 1. Tablolar

`migrations/` klasöründeki dosyalar numara sırasıyla **SQL Editor**'da çalıştırılır. Her dosya yalnızca bir kez çalıştırılır.

Projede iki güvenlik ayarı açık tutulur (proje oluşturulurken seçildi):

- **Enable RLS on new tables automatically: açık.** Kuralı yazılmamış bir tablo API'den hiç okunamaz.
- **Grant API access to new tables automatically: kapalı.** Bu yüzden her yeni tablo için migration içinde açıkça `grant` yazılmalıdır, yoksa uygulama "permission denied" hatası alır.

## 2. E-posta ile doğrulama kodu

**Authentication > Emails** bölümünde:

| Şablon | Konu | Gövde |
| --- | --- | --- |
| Confirm signup | `{{ .Token }} doğrulama kodun` | `templates/confirm-signup.html` |
| Reset password | `{{ .Token }} şifre sıfırlama kodun` | `templates/reset-password.html` |

Kod uzunluğu 6 hane olmalıdır (**Authentication > Sign In / Providers > Email > Email OTP Length**). Bu değer `packages/core/src/validation.ts` içindeki `OTP_LENGTH` ile aynı olmalıdır.

Şablonlarda marka adı elle yazılıdır; ad değişirse şablonlar da güncellenmelidir.

## 3. E-posta gönderimi

Supabase'in kendi e-posta servisi yalnızca proje ekibindeki adreslere ve saatte birkaç e-posta gönderir. Gerçek kullanıcılar için alan adı alındıktan sonra **Authentication > Emails > SMTP Settings** altında bir e-posta servisi (ör. Resend) bağlanmalıdır.

## 4. Uygulamanın bağlantısı

Proje adresi ve "publishable" anahtar `apps/web/src/lib/supabase/config.ts` dosyasındadır. Bu iki değer tarayıcıya gönderilen, herkese açık değerlerdir. "Secret" anahtar hiçbir zaman depoya yazılmaz.
