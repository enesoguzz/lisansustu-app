import { IMPORT_FORMAT, parseImport, type ImportPayload } from "@lisansustu/core";

/** Testlerde "şimdi": örnek ilanın son başvurusundan önce. */
export const NOW = new Date("2026-11-28T00:00:00Z");

/** Boğaziçi 2026-2027 Bahar ilanındaki gerçek satırlardan kurulmuş küçük bir içe aktarma dosyası. */
export function sampleDoc() {
  return {
    format: IMPORT_FORMAT,
    university: {
      slug: "bogazici",
      name: "Boğaziçi Üniversitesi",
      short_name: "Boğaziçi",
      city: "İstanbul",
      kind: "devlet",
      website: "https://bogazici.edu.tr",
    },
    rules: [
      {
        degree: "doktora",
        details: { ales: { required: true, options: [{ type: "SAY", min: 55 }] } },
        notes: "Yönetmelikteki alt sınırlar.",
        source_url: "https://adaylar.bogazici.edu.tr/",
      },
    ],
    call: {
      academic_year: 2026,
      semester: "bahar",
      application_start: "2026-12-14T10:00:00+03:00",
      application_end: "2026-12-21T17:00:00+03:00",
      timeline: [{ label: "Bilim sınavı", date: "2026-12-25", endDate: "2026-12-29" }],
      source_url: "https://adaylar.bogazici.edu.tr/tr-TR/Sayfa/Basvuru/Lisansustu/Tum",
      source_checked_on: "2026-11-28",
    },
    listings: [
      {
        program: { name: "Bilgisayar Mühendisliği", institute: "Fen Bilimleri Enstitüsü", field: "muhendislik", url: "https://cmpe.bogazici.edu.tr/" },
        degree: "yl-tezli",
        language: "en",
        details: {
          quota: { main: 30, prep: 1, source: "30 (Esas sınıf) + 1 (Dil hazırlık sınıfı)" },
          ales: { required: true, options: [{ type: "SAY", min: 70 }], substitutes: [{ exam: "GRE", section: "Sayısal", min: 153 }] },
          gpa: { min4: 2.5, variants: [{ when: "Alan dışından başvuranlar", min4: 2.6 }] },
          language: {
            required: true,
            rules: [{ label: "İngilizce yeterlik", options: [{ exam: "KURUM", name: "BUEPT", grade: "C" }, { exam: "IELTS", min: 6.5 }] }],
          },
        },
      },
      {
        program: { name: "Bilgisayar Mühendisliği", institute: "Fen Bilimleri Enstitüsü" },
        degree: "doktora",
        language: "en",
        details: {
          quota: { main: 10 },
          ales: { required: true, options: [{ type: "SAY", min: 80 }] },
          gpa: { min4: 3 },
          language: {
            required: true,
            rules: [
              { label: "İngilizce yeterlik", options: [{ exam: "KURUM", name: "BUEPT", grade: "C" }] },
              { label: "Doktora yabancı dil şartı", options: [{ exam: "YDS", min: 55 }, { exam: "YOKDIL", min: 55 }] },
            ],
          },
        },
      },
      { program: { name: "İşletme", institute: "Sosyal Bilimler Enstitüsü" }, degree: "yl-tezsiz", language: "en", accepting: false },
    ],
  };
}

/** Dosyayı sitenin yaptığı gibi denetleyip veritabanına gönderilecek hâle getirir. */
export function toPayload(doc: unknown): ImportPayload {
  const { payloads, issues } = parseImport(doc, NOW);
  const errors = issues.filter((issue) => issue.level === "error");
  if (errors.length || payloads.length !== 1) throw new Error(`Örnek dosya geçersiz: ${JSON.stringify(errors)}`);
  return payloads[0];
}
