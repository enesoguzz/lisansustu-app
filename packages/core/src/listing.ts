/**
 * Bir ilanın şartları ve ayrıntıları: veri tipleri, şema (denetim + form) ve bunlardan türetilen değerler.
 *
 * İlan = bir programın bir derecesinin bir dönemdeki çağrısı (ör. Bilgisayar Mühendisliği, Doktora, 2026-2027 Bahar).
 * Şartlar üniversiteden üniversiteye çok değiştiği için ayrıntılar tek bir yapılandırılmış alanda (`details`) tutulur;
 * filtrelenecek birkaç değer bu alandan türetilip ayrı sütunlara yazılır (`deriveColumns`).
 */
import {
  ALES_SUBSTITUTES,
  ALES_TYPES,
  CURRENCIES,
  FEE_UNITS,
  LANGUAGE_EXAMS,
  entries,
  type AlesSubstituteExam,
  type AlesType,
  type Currency,
  type FeeUnit,
  type LanguageExam,
} from "./catalog";
import type { FieldNode, ObjectNode } from "./schema";
import { formatNumber } from "./text";

/* ------------------------------------------------------------------ tipler */

export type AlesOption = { type: AlesType; min: number };
export type AlesSubstitute = { exam: AlesSubstituteExam; name?: string; section?: string; min?: number; note?: string };
export type AlesVariant = { when: string; gpaMin?: number; gpaMax?: number; options: AlesOption[]; substitutes?: AlesSubstitute[] };
export type AlesRule = {
  /** false: ALES istenmiyor. */
  required: boolean;
  /** Kabul edilen puan türleri ve alt sınırları; biri yeterlidir. */
  options?: AlesOption[];
  /** Puan türü yazılmamışsa alt sınır ("programın puan türünde en az 55"). Tür belliyse `options` kullanılır. */
  min?: number;
  /** ALES yerine kabul edilen sınavlar ve ilanda yazan karşılıkları. */
  substitutes?: AlesSubstitute[];
  /** Adayın durumuna (not ortalaması, alan dışı olma vb.) göre değişen şartlar. */
  variants?: AlesVariant[];
  note?: string;
  /** İlandaki özgün cümle. */
  source?: string;
};

export type GpaVariant = { when: string; min4?: number; min100?: number };
export type GpaRule = {
  /** Lisans not ortalaması alt sınırı, 4'lük sistem. İlanda yazdığı gibi; başka sistemden çevrilmez. */
  min4?: number;
  /** Lisans not ortalaması alt sınırı, 100'lük sistem. */
  min100?: number;
  /** Yüksek lisans not ortalaması alt sınırı (doktora başvurularında). */
  masterMin4?: number;
  masterMin100?: number;
  variants?: GpaVariant[];
  note?: string;
  source?: string;
};

export type LanguageOption = {
  exam: LanguageExam;
  /** Üniversitenin kendi sınavının ya da "Diğer" sınavın adı (ör. BUEPT). */
  name?: string;
  min?: number;
  /** Puan yerine harf ya da düzey isteniyorsa (ör. "C"). */
  grade?: string;
  /** Alt puan şartı, ilandaki gibi. */
  sections?: string;
};
export type LanguageRule = {
  /** Şartın adı: "İngilizce yeterlik", "Doktora yabancı dil şartı" */
  label: string;
  language?: string;
  /** Kabul edilen sınavlar; biri yeterlidir. */
  options: LanguageOption[];
  note?: string;
  source?: string;
};
export type LanguageRequirement = {
  required: boolean;
  /** Her biri ayrı ayrı sağlanması gereken şartlar. */
  rules?: LanguageRule[];
  note?: string;
};

export type QuotaTrack = { name: string; main?: number; prep?: number; note?: string };
export type Quota = {
  /** Asıl kontenjan (esas sınıf). */
  main?: number;
  /** Dil hazırlık sınıfı kontenjanı. */
  prep?: number;
  inField?: number;
  outOfField?: number;
  international?: number;
  transfer?: number;
  /** Programın alt dallarına ayrılmış kontenjanlar. */
  tracks?: QuotaTrack[];
  extra?: { label: string; count: number }[];
  note?: string;
  source?: string;
};

export type Background = { text?: string; fields?: string[]; anyField?: boolean; source?: string };
export type ExamSlot = { date?: string; time?: string; place?: string; note?: string };
export type ExamInfo = { written?: ExamSlot; interview?: ExamSlot; note?: string };
export type Evaluation = { weights?: { item: string; percent: number }[]; passMark?: number; note?: string };
export type DocumentItem = { label: string; detail?: string; count?: number };
export type Fee = { amount?: number; currency?: Currency; unit?: FeeUnit; note?: string };
export type Contact = { phone?: string; email?: string; url?: string };

export type ListingDetails = {
  quota?: Quota;
  ales?: AlesRule;
  gpa?: GpaRule;
  language?: LanguageRequirement;
  /** Alan ve ön koşullar (hangi lisans alanlarından başvurulabilir vb.). */
  background?: Background;
  /** Bilim sınavı ve mülakat. */
  exam?: ExamInfo;
  evaluation?: Evaluation;
  documents?: DocumentItem[];
  /** Bilimsel hazırlık. */
  prep?: string;
  fee?: Fee;
  contact?: Contact;
  notes?: string;
};

/* ------------------------------------------------------------------ şema */

const note = (label = "Not"): FieldNode => ({ kind: "text", label, multiline: true, max: 2000 });
const source: FieldNode = {
  kind: "text",
  label: "Kaynaktaki ifade",
  multiline: true,
  max: 2000,
  hint: "İlandaki özgün cümle. Yayınlamadan önce karşılaştırmak için.",
};
const count = (label: string, hint?: string): FieldNode => ({ kind: "number", label, integer: true, min: 0, max: 10000, hint });

const alesOption: ObjectNode = {
  kind: "object",
  label: "Seçenek",
  inline: true,
  fields: {
    type: { kind: "enum", label: "Puan türü", options: entries(ALES_TYPES), required: true },
    min: { kind: "number", label: "Alt sınır", min: 0, max: 100, required: true },
  },
};

const alesSubstitute: ObjectNode = {
  kind: "object",
  label: "Sınav",
  inline: true,
  fields: {
    exam: { kind: "enum", label: "Sınav", options: entries(ALES_SUBSTITUTES), required: true },
    name: { kind: "text", label: "Sınavın adı", max: 80, hint: "Yalnızca “Diğer” seçildiyse." },
    section: { kind: "text", label: "Bölüm", max: 60, placeholder: "Sayısal" },
    min: { kind: "number", label: "Alt sınır", min: 0, max: 1000 },
    note: { kind: "text", label: "Not", max: 500 },
  },
};

const alesSchema: ObjectNode = {
  kind: "object",
  label: "ALES",
  fields: {
    required: { kind: "bool", label: "ALES isteniyor", required: true },
    options: {
      kind: "list",
      label: "Kabul edilen puanlar",
      hint: "Birden fazla satır varsa biri yeterlidir.",
      item: alesOption,
      itemName: "Seçenek",
      max: 6,
    },
    min: {
      kind: "number",
      label: "Alt sınır (puan türü yazılmamışsa)",
      min: 0,
      max: 100,
      hint: "Kaynakta yalnızca “programın puan türünde en az 55” gibi yazıyorsa. Puan türü belliyse üstteki satırları kullan.",
    },
    substitutes: { kind: "list", label: "ALES yerine kabul edilen sınavlar", item: alesSubstitute, itemName: "Sınav", max: 6 },
    variants: {
      kind: "list",
      label: "Adayın durumuna göre değişen şartlar",
      hint: "Ör. not ortalaması düşük olan adaydan daha yüksek ALES isteniyorsa.",
      itemName: "Koşul",
      max: 6,
      item: {
        kind: "object",
        label: "Koşul",
        fields: {
          when: { kind: "text", label: "Kimler için", max: 300, required: true, placeholder: "Not ortalaması 2,25 - 2,49 olanlar" },
          gpaMin: { kind: "number", label: "Not ortalaması en az (4'lük)", min: 0, max: 4 },
          gpaMax: { kind: "number", label: "Not ortalaması en çok (4'lük)", min: 0, max: 4 },
          options: { kind: "list", label: "Kabul edilen puanlar", item: alesOption, itemName: "Seçenek", max: 6, required: true },
          substitutes: { kind: "list", label: "ALES yerine kabul edilen sınavlar", item: alesSubstitute, itemName: "Sınav", max: 6 },
        },
      },
    },
    note: note(),
    source,
  },
};

const gpaSchema: ObjectNode = {
  kind: "object",
  label: "Not ortalaması",
  fields: {
    min4: { kind: "number", label: "Lisans alt sınırı (4'lük)", min: 0, max: 4 },
    min100: { kind: "number", label: "Lisans alt sınırı (100'lük)", min: 0, max: 100 },
    masterMin4: { kind: "number", label: "Yüksek lisans alt sınırı (4'lük)", min: 0, max: 4 },
    masterMin100: { kind: "number", label: "Yüksek lisans alt sınırı (100'lük)", min: 0, max: 100 },
    variants: {
      kind: "list",
      label: "Adayın durumuna göre değişen sınırlar",
      itemName: "Koşul",
      max: 6,
      item: {
        kind: "object",
        label: "Koşul",
        inline: true,
        fields: {
          when: { kind: "text", label: "Kimler için", max: 300, required: true, placeholder: "Alan dışından başvuranlar" },
          min4: { kind: "number", label: "Alt sınır (4'lük)", min: 0, max: 4 },
          min100: { kind: "number", label: "Alt sınır (100'lük)", min: 0, max: 100 },
        },
      },
    },
    note: note(),
    source,
  },
};

const languageSchema: ObjectNode = {
  kind: "object",
  label: "Yabancı dil",
  fields: {
    required: { kind: "bool", label: "Yabancı dil şartı var", required: true },
    rules: {
      kind: "list",
      label: "Şartlar",
      hint: "Her şart ayrı ayrı sağlanmalıdır; bir şartın içindeki sınavlardan biri yeterlidir.",
      itemName: "Şart",
      max: 6,
      item: {
        kind: "object",
        label: "Şart",
        fields: {
          label: { kind: "text", label: "Şartın adı", max: 120, required: true, placeholder: "İngilizce yeterlik" },
          language: { kind: "text", label: "Dil", max: 60, placeholder: "İngilizce" },
          options: {
            kind: "list",
            label: "Kabul edilen sınavlar",
            itemName: "Sınav",
            max: 12,
            required: true,
            item: {
              kind: "object",
              label: "Sınav",
              inline: true,
              fields: {
                exam: { kind: "enum", label: "Sınav", options: entries(LANGUAGE_EXAMS), required: true },
                name: { kind: "text", label: "Sınavın adı", max: 80, hint: "Kendi sınavı ya da “Diğer” için." },
                min: { kind: "number", label: "Alt sınır", min: 0, max: 1000 },
                grade: { kind: "text", label: "Harf / düzey", max: 40 },
                sections: { kind: "text", label: "Alt puan şartı", max: 400 },
              },
            },
          },
          note: note(),
          source,
        },
      },
    },
    note: note(),
  },
};

const quotaSchema: ObjectNode = {
  kind: "object",
  label: "Kontenjan",
  fields: {
    main: count("Asıl kontenjan"),
    prep: count("Dil hazırlık sınıfı"),
    inField: count("Alan içi"),
    outOfField: count("Alan dışı"),
    international: count("Yabancı uyruklu"),
    transfer: count("Yatay geçiş"),
    tracks: {
      kind: "list",
      label: "Alt dallara göre kontenjan",
      itemName: "Alt dal",
      max: 30,
      item: {
        kind: "object",
        label: "Alt dal",
        inline: true,
        fields: {
          name: { kind: "text", label: "Alt dal", max: 160, required: true },
          main: count("Asıl"),
          prep: count("Dil hazırlık"),
          note: { kind: "text", label: "Not", max: 300 },
        },
      },
    },
    extra: {
      kind: "list",
      label: "Diğer kontenjanlar",
      itemName: "Kontenjan",
      max: 10,
      item: {
        kind: "object",
        label: "Kontenjan",
        inline: true,
        fields: {
          label: { kind: "text", label: "Adı", max: 160, required: true },
          count: { ...count("Sayı"), required: true },
        },
      },
    },
    note: note(),
    source,
  },
};

const examSlot = (label: string): FieldNode => ({
  kind: "object",
  label,
  inline: true,
  fields: {
    date: { kind: "date", label: "Tarih" },
    time: { kind: "text", label: "Saat", max: 60, placeholder: "10.00" },
    place: { kind: "text", label: "Yer", max: 300 },
    note: { kind: "text", label: "Not", max: 1000 },
  },
});

export const DETAILS_SCHEMA: ObjectNode = {
  kind: "object",
  label: "Şartlar ve ayrıntılar",
  fields: {
    quota: quotaSchema,
    ales: alesSchema,
    gpa: gpaSchema,
    language: languageSchema,
    background: {
      kind: "object",
      label: "Alan ve ön koşullar",
      fields: {
        text: { kind: "text", label: "Koşullar", multiline: true, max: 3000 },
        fields: {
          kind: "list",
          label: "Kabul edilen lisans alanları",
          itemName: "Alan",
          max: 60,
          item: { kind: "text", label: "Alan", max: 160 },
        },
        anyField: { kind: "bool", label: "Her alandan başvurulabilir" },
        source,
      },
    },
    exam: {
      kind: "object",
      label: "Bilim sınavı ve mülakat",
      fields: { written: examSlot("Yazılı sınav"), interview: examSlot("Mülakat / sözlü sınav"), note: note() },
    },
    evaluation: {
      kind: "object",
      label: "Değerlendirme",
      fields: {
        weights: {
          kind: "list",
          label: "Ağırlıklar",
          itemName: "Kalem",
          max: 10,
          item: {
            kind: "object",
            label: "Kalem",
            inline: true,
            fields: {
              item: { kind: "text", label: "Kalem", max: 120, required: true, placeholder: "ALES" },
              percent: { kind: "number", label: "Yüzde", min: 0, max: 100, required: true },
            },
          },
        },
        passMark: { kind: "number", label: "Başarı notu (100 üzerinden)", min: 0, max: 100 },
        note: note(),
      },
    },
    documents: {
      kind: "list",
      label: "Belgeler",
      itemName: "Belge",
      max: 40,
      item: {
        kind: "object",
        label: "Belge",
        inline: true,
        fields: {
          label: { kind: "text", label: "Belge", max: 160, required: true },
          count: { kind: "number", label: "Adet", integer: true, min: 0, max: 20 },
          detail: { kind: "text", label: "Açıklama", multiline: true, max: 2000 },
        },
      },
    },
    prep: { kind: "text", label: "Bilimsel hazırlık", multiline: true, max: 2000 },
    fee: {
      kind: "object",
      label: "Ücret",
      inline: true,
      fields: {
        amount: { kind: "number", label: "Tutar", min: 0, max: 100000000 },
        currency: { kind: "enum", label: "Para birimi", options: entries(CURRENCIES) },
        unit: { kind: "enum", label: "Neyin ücreti", options: entries(FEE_UNITS) },
        note: { kind: "text", label: "Not", max: 1000 },
      },
    },
    contact: {
      kind: "object",
      label: "İletişim",
      inline: true,
      fields: {
        phone: { kind: "text", label: "Telefon", max: 80 },
        email: { kind: "text", label: "Bölüm e-postası", max: 160, hint: "Kişiye ait adres yazma." },
        url: { kind: "url", label: "Web adresi" },
      },
    },
    notes: { kind: "text", label: "Notlar", multiline: true, max: 4000 },
  },
};

/* ------------------------------------------------------------------ türetilen değerler */

/** `listings` tablosunda ayrı sütun olarak tutulan, filtrelemede kullanılan değerler. */
export type DerivedColumns = {
  quota_total: number | null;
  ales_required: boolean | null;
  /** O puan türüyle başvurabilmek için gereken en düşük puan; tür kabul edilmiyorsa null. */
  ales_say_min: number | null;
  ales_soz_min: number | null;
  ales_ea_min: number | null;
  gpa_min4: number | null;
  gpa_min100: number | null;
  lang_required: boolean | null;
  /** İlanda YDS türü sınavlar için yazan alt sınır (birden fazla şart varsa en yükseği). */
  yds_min: number | null;
};

const lowest = (values: (number | undefined)[]): number | null => {
  const numbers = values.filter((v): v is number => typeof v === "number");
  return numbers.length ? Math.min(...numbers) : null;
};

/** Asıl + dil hazırlık kontenjanı. Alt dallar yazılmış ve toplam verilmemişse alt dalların toplamı. */
export function quotaTotal(quota: Quota | undefined): number | null {
  if (!quota) return null;
  if (quota.main !== undefined || quota.prep !== undefined) return (quota.main ?? 0) + (quota.prep ?? 0);
  if (quota.tracks?.some((t) => t.main !== undefined || t.prep !== undefined)) {
    return quota.tracks.reduce((sum, t) => sum + (t.main ?? 0) + (t.prep ?? 0), 0);
  }
  if (quota.inField !== undefined || quota.outOfField !== undefined) return (quota.inField ?? 0) + (quota.outOfField ?? 0);
  return null;
}

function alesOptions(ales: AlesRule): AlesOption[] {
  return [...(ales.options ?? []), ...(ales.variants ?? []).flatMap((v) => v.options)];
}

export function deriveColumns(details: ListingDetails | undefined): DerivedColumns {
  const d = details ?? {};
  const options = d.ales?.required ? alesOptions(d.ales) : [];
  // Puan türü yazılmamışsa sınır her tür için geçerli sayılır: hangi türün arandığı bilinmediğinden ilan hiçbir türde gizlenmez.
  const anyType = d.ales?.required && !options.length ? (d.ales.min ?? null) : null;
  const alesMin = (type: AlesType) => (options.length ? lowest(options.filter((o) => o.type === type).map((o) => o.min)) : anyType);

  const ydsFloors = (d.language?.required ? (d.language.rules ?? []) : [])
    .map((rule) => lowest(rule.options.filter((o) => o.exam === "YDS" || o.exam === "YOKDIL").map((o) => o.min)))
    .filter((v): v is number => v !== null);

  return {
    quota_total: quotaTotal(d.quota),
    ales_required: d.ales ? d.ales.required : null,
    ales_say_min: alesMin("SAY"),
    ales_soz_min: alesMin("SOZ"),
    ales_ea_min: alesMin("EA"),
    gpa_min4: lowest([d.gpa?.min4, ...(d.gpa?.variants ?? []).map((v) => v.min4)]),
    gpa_min100: lowest([d.gpa?.min100, ...(d.gpa?.variants ?? []).map((v) => v.min100)]),
    lang_required: d.language ? d.language.required : null,
    yds_min: ydsFloors.length ? Math.max(...ydsFloors) : null,
  };
}

/* ------------------------------------------------------------------ kısa özetler */

const ALES_ABBR: Record<AlesType, string> = { SAY: "SAY", SOZ: "SÖZ", EA: "EA" };

function optionsText(options: AlesOption[]): string {
  if (!options.length) return "";
  const sameMin = options.every((o) => o.min === options[0].min);
  if (sameMin) return `${options.map((o) => ALES_ABBR[o.type]).join(" / ")} ${formatNumber(options[0].min)}`;
  return options.map((o) => `${ALES_ABBR[o.type]} ${formatNumber(o.min)}`).join(" veya ");
}

/** "SAY 70", "EA / SAY / SÖZ 75", "İstenmiyor", "SAY 70-75 (koşullu)", "En az 55" */
export function alesSummary(ales: AlesRule | undefined): string {
  if (!ales) return "";
  if (!ales.required) return "İstenmiyor";
  const base = optionsText(ales.options ?? []);
  if (base) return ales.variants?.length ? `${base} (koşullu)` : base;
  if (ales.variants?.length) {
    const all = ales.variants.flatMap((v) => v.options);
    const types = [...new Set(all.map((o) => ALES_ABBR[o.type]))].join(" / ");
    const mins = all.map((o) => o.min);
    const [lo, hi] = [Math.min(...mins), Math.max(...mins)];
    return `${types} ${lo === hi ? formatNumber(lo) : `${formatNumber(lo)}-${formatNumber(hi)}`} (koşullu)`;
  }
  if (ales.min !== undefined) return `En az ${formatNumber(ales.min)}`;
  return "İsteniyor";
}

/** "2,50", "2,40 (YL 3,25)", "YL 3,00", "70/100" */
export function gpaSummary(gpa: GpaRule | undefined): string {
  if (!gpa) return "";
  const bachelor = gpa.min4 !== undefined ? formatNumber(gpa.min4, 2) : gpa.min100 !== undefined ? `${formatNumber(gpa.min100)}/100` : "";
  const master =
    gpa.masterMin4 !== undefined ? `YL ${formatNumber(gpa.masterMin4, 2)}` : gpa.masterMin100 !== undefined ? `YL ${formatNumber(gpa.masterMin100)}/100` : "";
  let text = bachelor && master ? `${bachelor} (${master})` : bachelor || master;
  if (!text && gpa.variants?.length) {
    const lo = lowest(gpa.variants.map((v) => v.min4));
    text = lo !== null ? formatNumber(lo, 2) : "";
  }
  return gpa.variants?.length && text ? `${text} (koşullu)` : text;
}

function examName(option: LanguageOption): string {
  if ((option.exam === "KURUM" || option.exam === "DIGER") && option.name) return option.name;
  return LANGUAGE_EXAMS[option.exam];
}

/** "BUEPT C / TOEFL iBT 4,5 / IELTS 6,5 / CAE C; YDS / e-YDS 55" */
export function languageSummary(language: LanguageRequirement | undefined): string {
  if (!language) return "";
  if (!language.required) return "İstenmiyor";
  const rules = language.rules ?? [];
  if (!rules.length) return "İsteniyor";
  return rules
    .map((rule) =>
      rule.options
        .map((o) => [examName(o), o.min !== undefined ? formatNumber(o.min) : (o.grade ?? "")].filter(Boolean).join(" "))
        .join(" / "),
    )
    .join("; ");
}

/** "30 + 1 hazırlık", "40 (5 alt dal)" */
export function quotaSummary(quota: Quota | undefined): string {
  if (!quota) return "";
  const total = quotaTotal(quota);
  if (quota.main !== undefined || quota.prep !== undefined) {
    if (!quota.prep) return String(quota.main ?? 0);
    return quota.main === undefined ? `${quota.prep} hazırlık` : `${quota.main} + ${quota.prep} hazırlık`;
  }
  if (quota.tracks?.length && total !== null) return `${total} (${quota.tracks.length} alt dal)`;
  return total !== null ? String(total) : "";
}
