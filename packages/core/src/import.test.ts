import { describe, expect, it } from "vitest";
import {
  IMPORT_FORMAT,
  alesSummary,
  check,
  deriveColumns,
  formatDate,
  formatDateTime,
  fromIstanbulInput,
  gpaSummary,
  hasErrors,
  languageSummary,
  parseImport,
  parseImportText,
  planImport,
  quotaSummary,
  quotaTotal,
  reviewDetails,
  sameInstant,
  slugify,
  stableStringify,
  toIstanbulInput,
  DETAILS_SCHEMA,
  type ExistingState,
  type ListingDetails,
} from "./index";

const NOW = new Date("2026-11-28T00:00:00Z");

/** Boğaziçi 2026-2027 Bahar ilanındaki gerçek satırlardan kurulmuş örnek. */
function sampleDoc() {
  return {
    format: IMPORT_FORMAT,
    university: { slug: "bogazici", name: "Boğaziçi Üniversitesi", short_name: "Boğaziçi", city: "İstanbul", kind: "devlet", website: "https://bogazici.edu.tr" },
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
            rules: [
              {
                label: "İngilizce yeterlik",
                options: [
                  { exam: "KURUM", name: "BUEPT", grade: "C" },
                  { exam: "TOEFL", min: 4.5, sections: "Her bölümden en az 4,5" },
                  { exam: "IELTS", min: 6.5, sections: "Akademik Yazma 6,5" },
                  { exam: "CAE", grade: "C" },
                ],
              },
            ],
          },
          documents: [{ label: "Referans mektubu", count: 2 }],
          exam: { written: { date: "2026-12-25", time: "09.00-12.00", place: "Bilgisayar Mühendisliği Binası" } },
        },
      },
      {
        program: { name: "Kimya Mühendisliği", institute: "Fen Bilimleri Enstitüsü" },
        degree: "doktora",
        language: "en",
        details: {
          quota: { main: 15, prep: 1 },
          ales: {
            required: true,
            variants: [
              { when: "Not ortalaması 3,10 - 3,24", gpaMin: 3.1, gpaMax: 3.24, options: [{ type: "SAY", min: 75 }], substitutes: [{ exam: "GRE", section: "Sayısal", min: 155 }] },
              { when: "Not ortalaması 3,25 ve üzeri", gpaMin: 3.25, options: [{ type: "SAY", min: 70 }], substitutes: [{ exam: "GRE", section: "Sayısal", min: 153 }] },
            ],
          },
          gpa: { min4: 3.1 },
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

describe("slugify", () => {
  it.each([
    ["Boğaziçi Üniversitesi", "bogazici-universitesi"],
    ["Elektrik - Elektronik Mühendisliği", "elektrik-elektronik-muhendisligi"],
    ["Eğitim Bilimleri (Rehberlik ve Psikolojik Danışmanlık)", "egitim-bilimleri-rehberlik-ve-psikolojik-danismanlik"],
    ["IŞIK  İSTANBUL", "isik-istanbul"],
    ["  Çağdaş Türk Dünyası & Öğrenme  ", "cagdas-turk-dunyasi-ve-ogrenme"],
    ["---", ""],
  ])("%s", (input, expected) => expect(slugify(input)).toBe(expected));

  it("uzun adları 80 karakterde keser ve tireyle bitirmez", () => {
    const slug = slugify("a ".repeat(60));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("tarihler", () => {
  it("Türkiye saatine çevirir ve geri yazar", () => {
    expect(toIstanbulInput("2026-12-14T07:00:00+00:00")).toBe("2026-12-14T10:00");
    expect(toIstanbulInput("2026-12-31T22:30:00Z")).toBe("2027-01-01T01:30");
    expect(fromIstanbulInput("2026-12-14T10:00")).toBe("2026-12-14T10:00:00+03:00");
    expect(fromIstanbulInput("14.12.2026")).toBeUndefined();
    expect(toIstanbulInput(null)).toBe("");
  });
  it("okunur biçimde yazar", () => {
    expect(formatDateTime("2026-12-21T17:00:00+03:00")).toBe("21 Aralık 2026 17.00");
    expect(formatDate("2026-12-05")).toBe("5 Aralık 2026");
    expect(formatDate("")).toBe("");
  });
  it("aynı anı farklı yazımlarda tanır", () => {
    expect(sameInstant("2026-12-14T10:00:00+03:00", "2026-12-14T07:00:00+00:00")).toBe(true);
    expect(sameInstant("2026-12-14T10:00:00+03:00", null)).toBe(false);
    expect(sameInstant(null, undefined)).toBe(true);
  });
});

describe("stableStringify", () => {
  it("anahtar sırasından ve undefined alanlardan etkilenmez", () => {
    expect(stableStringify({ b: 1, a: [{ d: 2, c: undefined }] })).toBe(stableStringify({ a: [{ d: 2 }], b: 1 }));
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
  });
});

describe("şema denetimi", () => {
  it("boşlukları temizler, boş alanları çıkarır", () => {
    const { value, issues } = check<ListingDetails>(DETAILS_SCHEMA, {
      notes: "  birinci   satır \r\n\r\n\r\n\r\n ikinci  ",
      prep: "   ",
      documents: [{ label: "  Transkript  " }, { label: "" }],
      contact: { phone: "", url: null },
    });
    expect(issues).toEqual([]);
    expect(value).toEqual({ notes: "birinci satır\n\nikinci", documents: [{ label: "Transkript" }] });
  });

  it("boş formda zorunlu alanları bildirir; boş bırakılan isteğe bağlı bölümü yok sayar", () => {
    const form = {
      kind: "object",
      label: "Form",
      fields: {
        name: { kind: "text", label: "Adı", required: true },
        ales: { kind: "object", label: "ALES", fields: { required: { kind: "bool", label: "İsteniyor", required: true } } },
      },
    } as const;
    for (const empty of [{}, undefined, null, { name: "  ", ales: {} }]) {
      expect(check(form, empty)).toEqual({ value: undefined, issues: [{ level: "error", path: "Adı", message: "Bu alan zorunlu." }] });
    }
    expect(check(form, { name: "Fizik", ales: { required: undefined } })).toEqual({ value: { name: "Fizik" }, issues: [] });
    expect(check(DETAILS_SCHEMA, {})).toEqual({ value: undefined, issues: [] });
  });

  it("tanınmayan alanı, yanlış türü ve aralık dışı sayıyı yeriyle birlikte bildirir", () => {
    const { issues } = check(DETAILS_SCHEMA, {
      quato: { main: 3 },
      ales: { required: "evet", options: [{ type: "SAYISAL", min: 170 }] },
      gpa: { min4: "2.50" },
      exam: { written: { date: "25.12.2026" } },
    });
    const text = issues.map((i) => `${i.path}: ${i.message}`).join("\n");
    expect(text).toContain('Tanınmayan alan: "quato"');
    expect(text).toContain("ALES › ALES isteniyor: true ya da false olmalı.");
    expect(text).toContain("ALES › Kabul edilen puanlar › Seçenek 1 › Puan türü: Şunlardan biri olmalı: SAY, SOZ, EA.");
    expect(text).toContain("Seçenek 1 › Alt sınır: En fazla 100 olabilir.");
    expect(text).toContain("Not ortalaması › Lisans alt sınırı (4'lük): Sayı olmalı");
    expect(text).toContain("Yazılı sınav › Tarih: Tarih YYYY-AA-GG biçiminde olmalı");
    expect(hasErrors(issues)).toBe(true);
  });

  it("zorunlu alan eksikse bir kez bildirir", () => {
    const { issues } = check(DETAILS_SCHEMA, { ales: { options: [{ type: "SAY" }] } });
    expect(issues.map((i) => `${i.path}: ${i.message}`)).toEqual([
      "ALES › ALES isteniyor: Bu alan zorunlu.",
      "ALES › Kabul edilen puanlar › Seçenek 1 › Alt sınır: Bu alan zorunlu.",
    ]);
  });

  it("geçersiz takvim günlerini reddeder", () => {
    expect(hasErrors(check(DETAILS_SCHEMA, { exam: { written: { date: "2026-02-30" } } }).issues)).toBe(true);
    expect(hasErrors(check(DETAILS_SCHEMA, { exam: { written: { date: "2028-02-29" } } }).issues)).toBe(false);
  });
});

describe("türetilen sütunlar ve özetler", () => {
  const [cmpe, che] = sampleDoc().listings.map((l) => l.details as ListingDetails);

  it("basit şart", () => {
    expect(deriveColumns(cmpe)).toEqual({
      quota_total: 31,
      ales_required: true,
      ales_say_min: 70,
      ales_soz_min: null,
      ales_ea_min: null,
      gpa_min4: 2.5,
      gpa_min100: null,
      lang_required: true,
      yds_min: null,
    });
    expect(alesSummary(cmpe.ales)).toBe("SAY 70");
    expect(gpaSummary(cmpe.gpa)).toBe("2,50 (koşullu)");
    expect(quotaSummary(cmpe.quota)).toBe("30 + 1 hazırlık");
    expect(languageSummary(cmpe.language)).toBe("BUEPT C / TOEFL iBT 4,5 / IELTS 6,5 / CAE C");
  });

  it("not ortalamasına bağlı ALES şartında en düşük sınırı alır", () => {
    const d = deriveColumns(che);
    expect(d.ales_say_min).toBe(70);
    expect(d.yds_min).toBe(55);
    expect(alesSummary(che.ales)).toBe("SAY 70-75 (koşullu)");
  });

  it("birden fazla puan türü, şart yok, ALES istenmiyor", () => {
    const any: ListingDetails = { ales: { required: true, options: [{ type: "EA", min: 75 }, { type: "SAY", min: 75 }, { type: "SOZ", min: 75 }] } };
    expect(alesSummary(any.ales)).toBe("EA / SAY / SÖZ 75");
    expect(deriveColumns(any)).toMatchObject({ ales_say_min: 75, ales_soz_min: 75, ales_ea_min: 75 });
    expect(alesSummary({ required: true, options: [{ type: "SAY", min: 70 }, { type: "EA", min: 75 }] })).toBe("SAY 70 veya EA 75");
    expect(alesSummary({ required: false })).toBe("İstenmiyor");
    expect(deriveColumns({ ales: { required: false, options: [{ type: "SAY", min: 70 }] } })).toMatchObject({ ales_required: false, ales_say_min: null });
    expect(deriveColumns(undefined)).toMatchObject({ quota_total: null, ales_required: null, lang_required: null });
  });

  it("puan türü yazılmamış ALES sınırı her tür için geçerli sayılır", () => {
    const rule: ListingDetails = { ales: { required: true, min: 55 } };
    expect(deriveColumns(rule)).toMatchObject({ ales_required: true, ales_say_min: 55, ales_soz_min: 55, ales_ea_min: 55 });
    expect(alesSummary(rule.ales)).toBe("En az 55");
    // Tür belliyse türsüz sınır dikkate alınmaz.
    const typed: ListingDetails = { ales: { required: true, min: 55, options: [{ type: "SAY", min: 70 }] } };
    expect(deriveColumns(typed)).toMatchObject({ ales_say_min: 70, ales_soz_min: null, ales_ea_min: null });
    expect(alesSummary(typed.ales)).toBe("SAY 70");
    expect(deriveColumns({ ales: { required: false, min: 55 } })).toMatchObject({ ales_say_min: null });
    expect(hasErrors(check(DETAILS_SCHEMA, rule).issues)).toBe(false);
    expect(hasErrors(check(DETAILS_SCHEMA, { ales: { required: true, min: 120 } }).issues)).toBe(true);
  });

  it("kontenjan toplamı", () => {
    expect(quotaTotal({ main: 6 })).toBe(6);
    expect(quotaTotal({ tracks: [{ name: "Geoteknik", main: 8 }, { name: "Yapı", main: 8, prep: 1 }] })).toBe(17);
    expect(quotaSummary({ tracks: [{ name: "Geoteknik", main: 8 }, { name: "Yapı", main: 8 }] })).toBe("16 (2 alt dal)");
    expect(quotaTotal({ inField: 8, outOfField: 2 })).toBe(10);
    expect(quotaTotal({ note: "ilan edilecek" })).toBeNull();
    expect(quotaSummary({ prep: 2 })).toBe("2 hazırlık");
    expect(quotaSummary({ main: 0, prep: 2 })).toBe("0 + 2 hazırlık");
    expect(gpaSummary({ min4: 2.4, masterMin4: 3.25 })).toBe("2,40 (YL 3,25)");
    expect(gpaSummary({ masterMin4: 3 })).toBe("YL 3,00");
    expect(gpaSummary({ min100: 70, masterMin100: 80 })).toBe("70/100 (YL 80/100)");
    expect(gpaSummary({ min100: 70 })).toBe("70/100");
    expect(gpaSummary({ note: "ilan edilecek" })).toBe("");
  });
});

describe("parseImport", () => {
  it("geçerli dosyayı veritabanına yazılacak hâle getirir", () => {
    const { payloads, issues } = parseImport(sampleDoc(), NOW);
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    expect(payloads).toHaveLength(1);
    const p = payloads[0];
    expect(p.call).toMatchObject({ institute: "", title: "2026-2027 Bahar Lisansüstü Başvuruları", notes: null });
    expect(p.listings.map((l) => [l.program.slug, l.degree, l.mode, l.language, l.accepting, l.quota_total])).toEqual([
      ["bilgisayar-muhendisligi", "yl-tezli", "orgun", "en", true, 31],
      ["kimya-muhendisligi", "doktora", "orgun", "en", true, 16],
      ["isletme", "yl-tezsiz", "orgun", "en", false, null],
    ]);
    expect(p.listings[2].details).toEqual({});
    expect(p.university.website).toBe("https://bogazici.edu.tr");
  });

  it("alım yapmayan ilan için eksik şart uyarısı vermez", () => {
    const { issues } = parseImport(sampleDoc(), NOW);
    expect(issues.some((i) => i.path.includes("İşletme"))).toBe(false);
  });

  it("uyarılar: eksik not ortalaması, düşük ALES, ağırlık toplamı, geçmiş tarih", () => {
    const doc = sampleDoc();
    doc.listings[0].details = {
      quota: { main: 0 },
      ales: { required: true, options: [{ type: "SAY", min: 50 }] },
      evaluation: { weights: [{ item: "ALES", percent: 50 }, { item: "Mülakat", percent: 40 }] },
    } as never;
    doc.listings[1].degree = "butunlesik-doktora";
    const { payloads, issues } = parseImport(doc, new Date("2027-02-01T00:00:00Z"));
    expect(payloads).toHaveLength(1);
    const text = issues.map((i) => `${i.level} ${i.path}: ${i.message}`).join("\n");
    expect(text).toContain("warning İlan 1 (Bilgisayar Mühendisliği, Tezli YL): Kontenjan 0 görünüyor");
    expect(text).toContain("warning İlan 1 (Bilgisayar Mühendisliği, Tezli YL) › ALES: Yönetmelik en az 55 ALES ister; burada 50 yazıyor.");
    expect(text).toContain("warning İlan 1 (Bilgisayar Mühendisliği, Tezli YL): Not ortalaması şartı yazılmamış.");
    expect(text).toContain("Değerlendirme ağırlıklarının toplamı 90; 100 olmalı.");
    expect(text).toContain("Lisans derecesiyle doktorada yönetmelik en az 80 ALES ister; burada 70 yazıyor.");
    expect(text).toContain("warning Dönem ilanı: Son başvuru tarihi geçmiş.");
  });

  it("formda (öneksiz) uyarının yeri yalnızca bölümün adıdır", () => {
    const issues = reviewDetails("yl-tezli", true, { quota: { main: 5 }, gpa: { min4: 2.5 }, ales: { required: true, options: [{ type: "SAY", min: 40 }] } }, "");
    expect(issues).toEqual([{ level: "warning", path: "ALES", message: "Yönetmelik en az 55 ALES ister; burada 40 yazıyor." }]);
    expect(reviewDetails("yl-tezli", true, {}, "").map((i) => i.path)).toEqual(["", "", ""]);
    expect(reviewDetails("yl-tezli", true, { quota: { main: 5 }, gpa: { min4: 2.5 }, ales: { required: true, min: 55 } }, "")).toEqual([
      { level: "warning", path: "ALES", message: "ALES puan türü yazılmamış." },
    ]);
    expect(reviewDetails("butunlesik-doktora", true, { quota: { main: 5 }, gpa: { min4: 3 }, ales: { required: true, min: 55 } }, "").map((i) => i.message)).toEqual([
      "ALES puan türü yazılmamış.",
      "Lisans derecesiyle doktorada yönetmelik en az 80 ALES ister; burada 55 yazıyor.",
    ]);
    expect(reviewDetails("yl-tezli", false, {}, "")).toEqual([]);
  });

  it("hatalar kaydı engeller: biçim, yinelenen ilan, dönemsiz ilan, ters tarih", () => {
    const wrongFormat = { ...sampleDoc(), format: "baska/9" };
    expect(parseImport(wrongFormat, NOW)).toMatchObject({ payloads: [] });
    expect(parseImport(wrongFormat, NOW).issues[0].message).toContain("Dosya biçimi tanınmadı");

    const dup = sampleDoc();
    dup.listings.push({ ...dup.listings[0] });
    const dupResult = parseImport(dup, NOW);
    expect(dupResult.payloads).toEqual([]);
    expect(dupResult.issues.some((i) => i.level === "error" && i.message.includes("1. ilanda da var"))).toBe(true);

    const { call: _call, ...noCall } = sampleDoc();
    expect(parseImport(noCall, NOW).issues.some((i) => i.message.includes("call bölümü eksik"))).toBe(true);

    const reversed = sampleDoc();
    reversed.call.application_end = "2026-12-01T17:00:00+03:00";
    expect(parseImport(reversed, NOW).issues.some((i) => i.level === "error" && i.message.includes("başvuru başlangıcından önce"))).toBe(true);
  });

  it("şema hatasında ilanın adını gösterir", () => {
    const doc = sampleDoc();
    (doc.listings[1].details as { gpa: unknown }).gpa = { min4: 31 };
    const { payloads, issues } = parseImport(doc, NOW);
    expect(payloads).toEqual([]);
    expect(issues[0]).toEqual({
      level: "error",
      path: "İlan 2 (Kimya Mühendisliği, Doktora) › Şartlar ve ayrıntılar › Not ortalaması › Lisans alt sınırı (4'lük)",
      message: "En fazla 4 olabilir.",
    });
  });

  it("aynı kısa ada düşen farklı programları yakalar", () => {
    const doc = sampleDoc();
    doc.listings.push({ program: { name: "Isletme", institute: "Sosyal Bilimler Enstitüsü" }, degree: "doktora", language: "en", accepting: false });
    const { issues } = parseImport(doc, NOW);
    expect(issues.some((i) => i.level === "error" && i.message.includes("aynı kısa ada (isletme)"))).toBe(true);
  });

  it("yalnızca üniversite ve genel kural içeren dosyayı kabul eder; birden fazla belgeyi sırayla okur", () => {
    const rulesOnly = {
      format: IMPORT_FORMAT,
      university: { slug: "khas", name: "Kadir Has Üniversitesi", city: "İstanbul", kind: "vakif" },
      rules: [
        { degree: "yl-tezli", details: { ales: { required: true, options: [{ type: "SAY", min: 55 }, { type: "SOZ", min: 55 }, { type: "EA", min: 55 }] } } },
        { degree: "yl-tezsiz", details: { ales: { required: false } } },
      ],
    };
    const { payloads, issues } = parseImport([rulesOnly, sampleDoc()], NOW);
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    expect(payloads.map((p) => [p.university.slug, p.rules.length, p.call !== null, p.listings.length])).toEqual([
      ["khas", 2, false, 0],
      ["bogazici", 0, true, 3],
    ]);
    expect(issues.every((i) => i.path.startsWith("Belge 2"))).toBe(true);
  });

  it("bozuk JSON'u anlaşılır biçimde bildirir", () => {
    expect(parseImportText("{ bozuk", NOW).issues[0].message).toContain("geçerli bir JSON değil");
    expect(parseImportText("   ", NOW).issues[0].message).toBe("Dosya boş.");
    expect(parseImportText("﻿" + JSON.stringify(sampleDoc()), NOW).payloads).toHaveLength(1);
  });
});

describe("planImport", () => {
  const payload = parseImport(sampleDoc(), NOW).payloads[0];
  const empty: ExistingState = { university: null, call: null, programs: [], listings: [], rules: [] };

  it("boş veritabanında her şey yenidir", () => {
    const plan = planImport(payload, empty);
    expect(plan.university.status).toBe("yeni");
    expect(plan.call).toMatchObject({ status: "yeni", published: false });
    expect(plan.counts).toEqual({ yeni: 3, degisti: 0, ayni: 0 });
    expect(plan.untouched).toBe(0);
  });

  it("aynı dosya ikinci kez yüklenirse hiçbir şey değişmez", () => {
    const existing: ExistingState = {
      university: { ...payload.university },
      // Veritabanı zamanı UTC olarak döndürür.
      call: { ...payload.call!, application_start: "2026-12-14T07:00:00+00:00", application_end: "2026-12-21T14:00:00+00:00", status: "yayinda" },
      programs: payload.listings.map((l) => ({ ...l.program })),
      listings: payload.listings.map((l) => ({
        program_slug: l.program.slug,
        degree: l.degree,
        mode: l.mode,
        language: l.language,
        accepting: l.accepting,
        application_end: null,
        details: JSON.parse(JSON.stringify(l.details)),
        source_url: null,
      })),
      rules: [],
    };
    const plan = planImport(payload, existing);
    expect(plan.university).toEqual({ status: "ayni", changes: [] });
    expect(plan.call).toEqual({ status: "ayni", changes: [], published: true });
    expect(plan.counts).toEqual({ yeni: 0, degisti: 0, ayni: 3 });

    // Değişen kısımlar adıyla listelenir; dosyada olmayan kayıtlı ilan sayılır.
    existing.listings[0].details = { ...existing.listings[0].details, quota: { main: 25, prep: 1 } };
    existing.listings[1].accepting = false;
    existing.listings.push({ program_slug: "fizik", degree: "doktora", mode: "orgun", language: "en", accepting: true, application_end: null, details: {}, source_url: null });
    existing.call = { ...existing.call, application_end: "2026-12-20T14:00:00+00:00" };
    existing.university = { ...existing.university, city: "Ankara" };
    const changed = planImport(payload, existing);
    expect(changed.listings.map((l) => [l.status, l.changes])).toEqual([
      ["degisti", ["kontenjan"]],
      ["degisti", ["alım durumu"]],
      ["ayni", []],
    ]);
    expect(changed.untouched).toBe(1);
    expect(changed.call).toMatchObject({ status: "degisti", changes: ["son başvuru"] });
    expect(changed.university).toEqual({ status: "degisti", changes: ["şehir"] });
  });

  it("dosyada yazmayan üniversite ve program bilgisi kayıtlı değeri değiştirmez", () => {
    const bare = parseImport({ ...sampleDoc(), university: { slug: "bogazici", name: "Boğaziçi Üniversitesi" } }, NOW).payloads[0];
    const plan = planImport(bare, { ...empty, university: { slug: "bogazici", name: "Boğaziçi Üniversitesi", city: "İstanbul", kind: "devlet", website: "https://x.example" } });
    expect(plan.university).toEqual({ status: "ayni", changes: [] });
  });
});
