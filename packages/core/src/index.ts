// Web ve ileride mobil uygulamanın paylaşacağı iş mantığı (veri tipleri, eşleştirme motoru).
// Adım 5'te kabul ihtimali hesaplaması buraya eklenecek.

export const DEGREE_TYPES = {
  "yl-tezli": "Tezli Yüksek Lisans",
  "yl-tezsiz": "Tezsiz Yüksek Lisans",
  "yl-uzaktan": "Uzaktan Eğitim Yüksek Lisans",
  doktora: "Doktora",
  "butunlesik-doktora": "Bütünleşik Doktora",
} as const;

export type DegreeType = keyof typeof DEGREE_TYPES;
