# Supabase kurulumu

Veritabanı ve üyelik Supabase üzerinde çalışır (proje: `lisansustu-app`, bölge: Frankfurt). Supabase CLI kullanılmıyor; aşağıdaki adımlar panelden elle uygulanır.

## 1. Tablolar

`migrations/` klasöründeki dosyalar numara sırasıyla **SQL Editor**'da çalıştırılır. Her dosya yalnızca bir kez çalıştırılır; çalıştırılan dosya sonradan değiştirilmez, değişiklik yeni numaralı bir dosyayla yapılır.

| Dosya | İçerik | Canlı projede |
| --- | --- | --- |
| `0001_profiles.sql` | Üye profili tablosu, erişim kuralları, kayıtta profil oluşturan tetikleyici | Çalıştırıldı |
| `0002_profile_limits.sql` | Ad, telefon ve okul alanlarına sunucu tarafı sınırları | Çalıştırıldı |

Projede iki güvenlik ayarı proje oluşturulurken şöyle seçildi:

- **Enable RLS on new tables automatically: açık.** Kuralı yazılmamış bir tablo API'den hiç okunamaz.
- **Grant API access to new tables automatically: kapalı.** Yeni tablolar `anon`, `authenticated` ve `service_role` rollerine kendiliğinden açılmaz. Bu yüzden her yeni tablonun migration dosyasında gereken `grant` açıkça yazılmalıdır, yoksa uygulama "permission denied" hatası alır. Sunucu tarafında gizli anahtarla okunacak tablolarda `service_role` için de `grant` gerekir.

## 2. Üyelik ayarları

**Authentication > Sign In / Providers** bölümünde:

- **Confirm email: açık.** Üye, e-postasını doğrulamadan giriş yapamaz.
- **Email > Email OTP Length: 6.** Yeni projelerde varsayılan 8'dir. Bu değer `packages/core/src/validation.ts` içindeki `OTP_LENGTH` ile aynı olmalıdır.
- **Email > Email OTP Expiration: 3600 saniye.** E-posta şablonlarındaki "Kod 1 saat geçerlidir" cümlesiyle aynı olmalıdır.
- **Email > Minimum password length: 8.** `validation.ts` içindeki `MIN_PASSWORD` ile aynı olmalıdır.

## 3. E-posta gönderimi

Supabase'in kendi e-posta servisi yalnızca deneme içindir: yalnızca proje ekibindeki adreslere, saatte birkaç e-posta gönderir ve şablonların düzenlenmesine izin vermez. Varsayılan şablonlarda doğrulama kodu yoktur, yalnızca İngilizce bir onay linki vardır. Kodlu e-posta için önce **Authentication > Emails > SMTP Settings** altında bir e-posta servisi bağlanmalıdır.

Resend için değerler:

| Alan | Değer |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Resend API anahtarı (yalnızca Supabase paneline yazılır, depoya girmez) |
| Sender email | Alan adı doğrulanana kadar `onboarding@resend.dev`, sonra alan adındaki bir adres |
| Sender name | `Lisansüstü` |

Alan adı doğrulanmadan Resend yalnızca Resend hesabının kendi e-posta adresine gönderir. Gerçek kullanıcılar için alan adı alınıp Resend'de doğrulanmalıdır.

## 4. E-posta şablonları

SMTP bağlandıktan sonra **Authentication > Emails** bölümünde:

| Şablon | Konu | Gövde |
| --- | --- | --- |
| Confirm sign up | `{{ .Token }} doğrulama kodun` | `templates/confirm-signup.html` |
| Reset password | `{{ .Token }} şifre sıfırlama kodun` | `templates/reset-password.html` |

Şablonlarda marka adı elle yazılıdır; ad değişirse şablonlar da güncellenmelidir.

## 5. Uygulamanın bağlantısı

Proje adresi ve "publishable" anahtar `apps/web/src/lib/supabase/config.ts` dosyasındadır. Bu iki değer tarayıcıya gönderilen, herkese açık değerlerdir. "Secret" anahtar hiçbir zaman depoya yazılmaz.
