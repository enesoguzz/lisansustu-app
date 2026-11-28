# Supabase kurulumu

Veritabanı ve üyelik Supabase üzerinde çalışır (proje: `lisansustu-app`, bölge: Frankfurt). Supabase CLI kullanılmıyor; aşağıdaki adımlar panelden elle uygulanır.

## 1. Tablolar

`migrations/` klasöründeki dosyalar numara sırasıyla **SQL Editor**'da çalıştırılır. Her dosya yalnızca bir kez çalıştırılır; çalıştırılan dosya sonradan değiştirilmez, değişiklik yeni numaralı bir dosyayla yapılır.

| Dosya | İçerik | Canlı projede |
| --- | --- | --- |
| `0001_profiles.sql` | Üye profili tablosu, erişim kuralları, kayıtta profil oluşturan tetikleyici | Çalıştırıldı |
| `0002_profile_limits.sql` | Ad, telefon ve okul alanlarına sunucu tarafı sınırları | Çalıştırıldı |
| `0003_kvkk_consent.sql` | KVKK Aydınlatma Metni onayının zamanı, kayıtta ve ilk girişte yazılması, sonradan değiştirilememesi | Çalıştırıldı |

Projede iki güvenlik ayarı proje oluşturulurken şöyle seçildi:

- **Enable RLS on new tables automatically: açık.** Kuralı yazılmamış bir tablo API'den hiç okunamaz.
- **Grant API access to new tables automatically: kapalı.** Yeni tablolar `anon`, `authenticated` ve `service_role` rollerine kendiliğinden açılmaz. Bu yüzden her yeni tablonun migration dosyasında gereken `grant` açıkça yazılmalıdır, yoksa uygulama "permission denied" hatası alır. Sunucu tarafında gizli anahtarla okunacak tablolarda `service_role` için de `grant` gerekir.

## 2. Üyelik ayarları

**Authentication > Sign In / Providers** bölümünde:

- **Confirm email: açık.** Üye, e-postasını doğrulamadan giriş yapamaz.
- **Email > Email OTP Expiration: 3600 saniye.** E-postadaki linkler 1 saat geçerlidir; e-posta şablonlarındaki cümleyle aynı olmalıdır.
- **Email > Minimum password length: 8.** `packages/core/src/validation.ts` içindeki `MIN_PASSWORD` ile aynı olmalıdır.

**Authentication > URL Configuration** bölümünde:

- **Site URL:** `https://lisansustu-app.vercel.app`
- **Redirect URLs:** `https://lisansustu-app.vercel.app/**`, `https://lisansustu-app-*-enesoguzzs-projects.vercel.app/**` (Vercel önizlemeleri), `http://localhost:3000/**`

E-postadaki linkler ve Google'dan dönüş yalnızca bu listedeki adreslere yönlenir; listede olmayan bir adres istenirse Site URL'e dönülür. Alan adı alındığında ikisi de güncellenmelidir.

## 3. E-postayla doğrulama nasıl çalışır

Doğrulama e-postadaki linkle yapılır (kod yok). Site üç dönüş sayfası kullanır:

| Sayfa | Ne zaman açılır |
| --- | --- |
| `/dogrula` | Kayıt e-postasındaki linke tıklanınca |
| `/sifre-yenile` | Şifre yenileme e-postasındaki linke tıklanınca |
| `/giris/google` | Google ekranından dönülünce |

- Kayıt linki, kaydın yapıldığı tarayıcıya bağlıdır. O tarayıcıda açılırsa oturum doğrudan açılır. Başka bir cihazda ya da e-posta uygulamasının kendi tarayıcısında açılırsa e-posta yine doğrulanır; üye giriş yapar ya da kayıt olduğu sayfaya dönüp "Doğruladım, devam et" der.
- Şifre yenileme linki her cihazda çalışır, çünkü şifresini unutan kişi başka yoldan giriş yapamaz.
- Aynı e-postayla daha önce başlanıp doğrulanmamış bir kayıt varsa Supabase o kayıttaki şifreyi ve bilgileri saklar. Link kaydın yapıldığı tarayıcıda açılırsa site, son yazılan şifreyi geçerli kılar; başka cihazda açılırsa üye "Şifremi unuttum" ile şifresini belirler.

## 4. Google ile giriş

- **Google Cloud:** `lisansustu-app` projesinde, "Lisansüstü web (Supabase)" adlı OAuth istemcisi. İzinli dönüş adresi: `https://hraroibzfshhhjwjfiuh.supabase.co/auth/v1/callback`
- **Supabase:** Authentication > Sign In / Providers > Google açık. Client ID herkese açık bir değerdir; Client Secret yalnızca Supabase paneline yazılır, depoya girmez.
- **Google uygulaması "Testing" modundadır:** yalnızca Google Cloud'da Google Auth Platform > Audience > Test users listesindeki hesaplar giriş yapabilir. Herkese açmak için "Publish app" gerekir; bunun için Branding bölümüne ana sayfa ve gizlilik politikası linkleri ile doğrulanmış bir alan adı girilmelidir.
- Google ile ilk kez gelen üyenin telefonu ve aydınlatma metni onayı yoktur; site bunları ilk girişte "Son bir adım" ekranında ister (`profiles.kvkk_accepted_at` boşsa).
- Apple ile giriş mobil uygulama aşamasında eklenecek (Apple Developer hesabı ve alan adı gerekir).

## 5. E-posta gönderimi

Supabase'in kendi e-posta servisi yalnızca deneme içindir:

- Yalnızca Supabase proje ekibindeki adreslere gönderir. Başka bir adresle kayıt olunmaya çalışılırsa site "Kayıtlar henüz herkese açık değil" der.
- Projenin tamamı için saatte 2 e-posta gönderir.
- Şablonların düzenlenmesine izin vermez; e-postalar İngilizce gider.

Gerçek kullanıcılar için **Authentication > Emails > SMTP Settings** altında bir e-posta servisi bağlanmalıdır. Resend için değerler:

| Alan | Değer |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Resend API anahtarı (yalnızca Supabase paneline yazılır, depoya girmez) |
| Sender email | Alan adı doğrulanana kadar `onboarding@resend.dev`, sonra alan adındaki bir adres |
| Sender name | `Lisansüstü` |

Alan adı doğrulanmadan Resend yalnızca Resend hesabının kendi e-posta adresine gönderir. Gerçek kullanıcılar için alan adı alınıp Resend'de doğrulanmalıdır.

## 6. E-posta şablonları

SMTP bağlandıktan sonra **Authentication > Emails** bölümünde:

| Şablon | Konu | Gövde |
| --- | --- | --- |
| Confirm sign up | `E-postanı doğrula` | `templates/confirm-signup.html` |
| Reset password | `Şifreni yenile` | `templates/reset-password.html` |

Şablonlarda marka adı elle yazılıdır; ad değişirse şablonlar da güncellenmelidir.

## 7. Uygulamanın bağlantısı

Proje adresi ve "publishable" anahtar `apps/web/src/lib/supabase/config.ts` dosyasındadır. Bu iki değer tarayıcıya gönderilen, herkese açık değerlerdir. "Secret" anahtar hiçbir zaman depoya yazılmaz.
