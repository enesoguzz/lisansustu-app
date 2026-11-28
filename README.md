# lisansustu-app

Yüksek lisans ve doktora başvurularını tek yerde toplayan, kabul ihtimalini tahmin eden ve ALES/YDS hazırlık içerikleri sunan platform.

## Yapı

- `apps/web`: Next.js web sitesi. Yönetim paneli `/yonetim` altındadır ve yalnızca yöneticilere açılır.
- `packages/core`: Web ve ileride mobil uygulamanın paylaşacağı iş mantığı (ilan veri yapısı, içe aktarma dosyasının denetimi, eşleştirme motoru)
- `packages/db`: Veritabanı testleri. `supabase/migrations` içindeki dosyaları gerçek bir PostgreSQL üzerinde çalıştırıp erişim kurallarını dener.
- `supabase`: Veritabanı tabloları (elle çalıştırılan SQL dosyaları), e-posta şablonları ve kurulum notları. Bkz. `supabase/README.md`.
- `data/imports`: Üniversite ilanlarından hazırlanmış, panelden yüklenen veri dosyaları. Bkz. `data/imports/README.md`.

## Çalıştırma

```bash
pnpm install
pnpm dev      # http://localhost:3000
pnpm build
```

## Denetimler

```bash
pnpm test       # birim testleri ve veritabanı testleri
pnpm typecheck
pnpm lint
pnpm e2e        # siteyi derler ve tarayıcıda uçtan uca dener (üyelik ve yönetim paneli)
```

Uçtan uca testler gerçek Supabase projesine dokunmaz: site, depodaki SQL dosyalarından kurulan yerel bir veritabanına bağlanır ve hiçbir e-posta gönderilmez.
