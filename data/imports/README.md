# İçe aktarma dosyaları

Üniversitelerin ilanlarından hazırlanmış veri dosyaları burada durur. Dosyalar siteye kendiliğinden girmez; yönetici onları panelden yükler ve kaydetmeden önce önizlemesini görür.

| Dosya | İçerik | Kaynak (bakıldığı gün) |
| --- | --- | --- |
| `bogazici-2026-bahar.json` | Boğaziçi Üniversitesi 2026-2027 Bahar lisansüstü başvuruları: 48 program, 79 ilan (25 tanesi öğrenci alıyor, 54 tanesi bu dönem alım yapmıyor) | adaylar.bogazici.edu.tr (28 Kasım 2026) |
| `itu-genel-kurallar.json` | İTÜ Lisansüstü Eğitim Enstitüsü'nün her program için geçerli alt sınırları (4 kural) | lee.itu.edu.tr başvuru sayfası (28 Kasım 2026) |
| `kadir-has-genel-kurallar.json` | Kadir Has Üniversitesi'nin her program için geçerli alt sınırları (4 kural) | Lisansüstü Eğitim Uygulama Yönergesi, Senato kararı 22.08.2024, 2024/10 |

## Nasıl yüklenir

1. Yönetici hesabıyla giriş yap, üst menüden **Yönetim**'e gir.
2. **Dosyadan içe aktar** sekmesinde dosyayı seç. Önizleme açılır: neyin yeni ekleneceği, neyin değişeceği ve varsa uyarılar görünür.
3. **Taslak olarak kaydet**'e bas. Kaydedilen dönem ilanı taslak olarak durur, sen **Yayına al** diyene kadar yönetici dışında kimse göremez.
4. Dönem ilanının sayfasında ilanları gözden geçir, gerekirse tek tek düzelt, sonra yayına al.

Aynı dosya yeniden yüklenirse hiçbir şey ikilenmez: değişmeyen ilanlar "aynı" sayılır, yalnızca farklı olanlar güncellenir. Panelden elle düzelttiğin bir ilanı eski dosya yeniden yüklenirse geri alır; önizleme bunu "değişecek" diye gösterir.

Genel kurallar dönem ilanına bağlı değildir. Üniversitenin sayfasında "Genel kurallar" başlığı altında durur ve kaydedildiği anda geçerli olur.

## Boğaziçi dosyasında eksik olanlar

Kaynak sayfada 54 program ve 98 ilan var. Dosyada 79 ilan bulunuyor; öğrenci alan şu 19 ilan henüz eklenmedi:

| Program | Eksik ilanlar |
| --- | --- |
| Kimya Mühendisliği | Doktora |
| Makina Mühendisliği | Tezli YL, Bütünleşik Doktora, Doktora |
| Matematik | Tezli YL |
| Matematik Eğitimi | Tezli YL, Doktora |
| Moleküler Biyoloji ve Genetik | Tezli YL, Bütünleşik Doktora, Doktora |
| Sistem ve Kontrol Mühendisliği | Tezli YL |
| Deprem Mühendisliği | Tezli YL, Bütünleşik Doktora, Doktora |
| Jeodezi | Tezli YL, Bütünleşik Doktora, Doktora |
| Jeofizik | Tezli YL, Doktora |

Bu ilanlar eklenmeden dönem ilanı yayına alınırsa, bu programlar sitede hiç yokmuş ya da alım yapmıyormuş gibi görünür. Eksikler tamamlanınca dosya güncellenir ve yeniden yüklenir; mevcut 79 ilan olduğu gibi kalır, yalnızca yeniler eklenir.

## Dosyalar hazırlanırken verilen kararlar

Kaynakta açıkça yazmayan ya da birden fazla biçimde okunabilen yerlerde şu yol izlendi. Yayına almadan önce bunlara göz atmakta yarar var.

- **Doktora not ortalaması (Boğaziçi).** Doktora ilanlarında tek bir "GNO" değeri yazıyor (çoğunda 3,00). Bu değer yüksek lisans not ortalaması olarak girildi ve ilanın notuna yazıldı, çünkü hem lisans hem yüksek lisans ortalaması isteyen programlar ikisini ayrı ayrı belirtiyor ve tek değerler yüksek lisans ortalamalarıyla aynı aralıkta. Kaynaktaki özgün ifade her ilanda "Kaynaktaki ifade" alanında duruyor.
- **Öğretim dili (Boğaziçi).** Türk Dili ve Edebiyatı dışındaki bütün programlar İngilizce olarak girildi.
- **Alan.** Programların alanı (mühendislik, fen, sosyal, eğitim gibi) kaynakta yazmıyor; filtrelemede kullanılmak üzere program adına göre seçildi.
- **İletişim.** Yalnızca telefon, web adresi ve bölümün ortak e-posta adresi alındı. Kişi adı ve kişisel e-posta adresi alınmadı.
- **Metinler.** Sayılar ve tarihler kaynaktaki gibidir; açıklamalar kısaltılarak yeniden yazıldı.
- **Puan türü yazmayan ALES sınırı (İTÜ, Kadir Has).** Yönetmelikler "programın puan türünde en az 55" diyor ve puan türünü programa bırakıyor. Bu yüzden sınır puan türü olmadan girildi.
- **İTÜ'de GRE.** Sayfada ALES yerine GRE Sayısal 610 yazıyor. Bu, GRE'nin eski 200-800 ölçeğindeki puandır; kuralın notunda belirtildi.

## Yeni dosya hazırlamak

Üniversitenin ilan linkini ya da PDF'ini sohbette Claude'a ver, bu biçimde bir dosya hazırlar. Biçimin tamamı `packages/core/src/import.ts` ve `packages/core/src/listing.ts` dosyalarında tanımlıdır; paneldeki formlar da aynı tanımdan üretilir. Özet:

```jsonc
{
  "format": "lisansustu-ilan/1",
  "university": { "slug": "bogazici", "name": "Boğaziçi Üniversitesi", "short_name": "Boğaziçi", "city": "İstanbul", "kind": "devlet", "website": "https://bogazici.edu.tr" },
  // Her program için geçerli alt sınırlar (isteğe bağlı)
  "rules": [{ "degree": "doktora", "details": { "ales": { "required": true, "min": 55 } } }],
  // Bir dönemin ilanı (isteğe bağlı; yalnızca genel kural taşıyan dosyada bulunmaz)
  "call": { "academic_year": 2026, "semester": "bahar", "application_start": "2026-12-14T10:00:00+03:00", "application_end": "2026-12-21T17:00:00+03:00" },
  // Her ilan: bir programın bir derecesi
  "listings": [
    {
      "program": { "name": "Bilgisayar Mühendisliği", "institute": "Fen Bilimleri Enstitüsü", "field": "muhendislik" },
      "degree": "yl-tezli",
      "language": "en",
      "details": {
        "quota": { "main": 30, "prep": 1 },
        "ales": { "required": true, "options": [{ "type": "SAY", "min": 70 }] },
        "gpa": { "min4": 2.5 },
        "language": { "required": true, "rules": [{ "label": "İngilizce yeterlik", "options": [{ "exam": "YDS", "min": 65 }] }] }
      }
    },
    // Bu dönem öğrenci almayan program
    { "program": { "name": "Fizik" }, "degree": "yl-tezli", "accepting": false }
  ]
}
```

Dereceler: `yl-tezli`, `yl-tezsiz`, `doktora`, `butunlesik-doktora`, `sanatta-yeterlik`. Dönemler: `guz`, `bahar`, `yaz`.

Bu klasördeki her dosya testlerde gerçek tablolara yüklenir (`pnpm test`). Biçim ya da tablolar değişince eskiyen dosya orada ortaya çıkar.
