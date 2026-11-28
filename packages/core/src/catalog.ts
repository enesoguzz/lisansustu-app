/** Sitede ve içe aktarma dosyalarında kullanılan sabit listeler. Anahtarlar veritabanına yazılır; değiştirme, yalnızca ekle. */

export const DEGREES = {
  "yl-tezli": "Tezli Yüksek Lisans",
  "yl-tezsiz": "Tezsiz Yüksek Lisans",
  doktora: "Doktora",
  "butunlesik-doktora": "Bütünleşik Doktora (lisans derecesiyle)",
  "sanatta-yeterlik": "Sanatta Yeterlik",
} as const;
export type Degree = keyof typeof DEGREES;

export const DEGREE_SHORT: Record<Degree, string> = {
  "yl-tezli": "Tezli YL",
  "yl-tezsiz": "Tezsiz YL",
  doktora: "Doktora",
  "butunlesik-doktora": "Bütünleşik Dr.",
  "sanatta-yeterlik": "Sanatta Yeterlik",
};

/** Öğretim türü. */
export const MODES = {
  orgun: "Örgün",
  "ikinci-ogretim": "İkinci öğretim",
  uzaktan: "Uzaktan öğretim",
} as const;
export type Mode = keyof typeof MODES;

/** Öğretim dili. */
export const TEACHING_LANGUAGES = {
  tr: "Türkçe",
  en: "İngilizce",
  "tr-en": "Kısmen İngilizce",
  diger: "Diğer",
} as const;
export type TeachingLanguage = keyof typeof TEACHING_LANGUAGES;

export const SEMESTERS = { guz: "Güz", bahar: "Bahar", yaz: "Yaz" } as const;
export type Semester = keyof typeof SEMESTERS;

export const UNIVERSITY_KINDS = { devlet: "Devlet", vakif: "Vakıf" } as const;
export type UniversityKind = keyof typeof UNIVERSITY_KINDS;

export const ALES_TYPES = { SAY: "Sayısal", SOZ: "Sözel", EA: "Eşit Ağırlık" } as const;
export type AlesType = keyof typeof ALES_TYPES;

/** ALES yerine kabul edilebilen sınavlar. */
export const ALES_SUBSTITUTES = { GRE: "GRE", GMAT: "GMAT", TUS: "TUS", DUS: "DUS", DIGER: "Diğer" } as const;
export type AlesSubstituteExam = keyof typeof ALES_SUBSTITUTES;

export const LANGUAGE_EXAMS = {
  YDS: "YDS / e-YDS",
  YOKDIL: "YÖKDİL",
  TOEFL: "TOEFL iBT",
  IELTS: "IELTS",
  PTE: "PTE Akademik",
  CAE: "CAE",
  CPE: "CPE",
  KURUM: "Üniversitenin kendi sınavı",
  DIGER: "Diğer",
} as const;
export type LanguageExam = keyof typeof LANGUAGE_EXAMS;

/** Alan kategorileri (filtre için). İlanlarda yazmaz; programa elle ya da dosyayla atanır. */
export const FIELDS = {
  muhendislik: "Mühendislik ve Teknoloji",
  fen: "Fen Bilimleri ve Matematik",
  saglik: "Sağlık Bilimleri",
  sosyal: "Sosyal Bilimler",
  egitim: "Eğitim Bilimleri",
  "iktisadi-idari": "İktisadi ve İdari Bilimler",
  hukuk: "Hukuk",
  beseri: "Dil, Edebiyat ve Beşeri Bilimler",
  "sanat-tasarim": "Güzel Sanatlar ve Tasarım",
  mimarlik: "Mimarlık ve Planlama",
  iletisim: "İletişim",
  ilahiyat: "İlahiyat",
  ziraat: "Ziraat, Orman ve Su Ürünleri",
  spor: "Spor Bilimleri",
  disiplinlerarasi: "Disiplinlerarası",
} as const;
export type Field = keyof typeof FIELDS;

export const CURRENCIES = { TRY: "TL", USD: "ABD doları", EUR: "Avro" } as const;
export type Currency = keyof typeof CURRENCIES;

export const FEE_UNITS = {
  program: "programın tamamı",
  yil: "yıllık",
  donem: "dönemlik",
  kredi: "kredi başına",
  ders: "ders başına",
} as const;
export type FeeUnit = keyof typeof FEE_UNITS;

/** "2026-2027 Bahar" */
export function termLabel(academicYear: number, semester: Semester): string {
  return `${academicYear}-${academicYear + 1} ${SEMESTERS[semester]}`;
}

export function entries<T extends Record<string, string>>(map: T): [keyof T & string, string][] {
  return Object.entries(map) as [keyof T & string, string][];
}
