/**
 * İçe aktarma dosyası: bir üniversitenin bir dönemlik ilanını (ve istenirse genel kurallarını) taşıyan JSON belgesi.
 *
 * Dosyayı şimdilik sohbette Claude hazırlar, yönetici panelden yükler. İleride paneldeki "Alanlara ayır"
 * düğmesi de aynı biçimi üretecek. Biçim değişirse `IMPORT_FORMAT` sürümü artırılır.
 */
import {
  DEGREES,
  DEGREE_SHORT,
  FIELDS,
  MODES,
  SEMESTERS,
  TEACHING_LANGUAGES,
  UNIVERSITY_KINDS,
  entries,
  termLabel,
  type Degree,
  type Field,
  type Mode,
  type Semester,
  type TeachingLanguage,
  type UniversityKind,
} from "./catalog";
import { sameInstant } from "./dates";
import { DETAILS_SCHEMA, deriveColumns, type DerivedColumns, type ListingDetails } from "./listing";
import { check, hasErrors, type Issue, type ObjectNode } from "./schema";
import { slugify, stableStringify } from "./text";

export const IMPORT_FORMAT = "lisansustu-ilan/1";

/* ------------------------------------------------------------------ şemalar (formlar da bunları kullanır) */

export const UNIVERSITY_SCHEMA: ObjectNode = {
  kind: "object",
  label: "Üniversite",
  fields: {
    name: { kind: "text", label: "Adı", max: 160, required: true },
    short_name: { kind: "text", label: "Kısa adı", max: 60, placeholder: "Boğaziçi, İTÜ" },
    city: { kind: "text", label: "Şehir", max: 60 },
    kind: { kind: "enum", label: "Türü", options: entries(UNIVERSITY_KINDS) },
    website: { kind: "url", label: "Web sitesi" },
    slug: { kind: "slug", label: "Adres adı", required: true, hint: "Sayfa adresinde ve dosyalarda kullanılır (ör. bogazici); sonradan değiştirilmez." },
  },
};

export const PROGRAM_SCHEMA: ObjectNode = {
  kind: "object",
  label: "Program",
  fields: {
    name: { kind: "text", label: "Program adı", max: 200, required: true },
    slug: { kind: "slug", label: "Adres adı", hint: "Boş bırakılırsa program adından üretilir." },
    institute: { kind: "text", label: "Enstitü", max: 160 },
    field: { kind: "enum", label: "Alan", options: entries(FIELDS) },
    url: { kind: "url", label: "Program sayfası" },
  },
};

export type TimelineItem = { label: string; date?: string; endDate?: string; time?: string; note?: string };

export const CALL_SCHEMA: ObjectNode = {
  kind: "object",
  label: "Dönem ilanı",
  fields: {
    institute: { kind: "text", label: "Enstitü", max: 160, hint: "İlan üniversitenin tamamı içinse boş bırak." },
    academic_year: { kind: "number", label: "Akademik yılın başlangıcı", integer: true, min: 2020, max: 2100, required: true, hint: "2026-2027 için 2026." },
    semester: { kind: "enum", label: "Dönem", options: entries(SEMESTERS), required: true },
    title: { kind: "text", label: "Başlık", max: 200 },
    application_start: { kind: "datetime", label: "Başvuru başlangıcı" },
    application_end: { kind: "datetime", label: "Son başvuru" },
    timeline: {
      kind: "list",
      label: "Takvim",
      itemName: "Tarih",
      max: 30,
      item: {
        kind: "object",
        label: "Tarih",
        inline: true,
        fields: {
          label: { kind: "text", label: "Ne", max: 160, required: true, placeholder: "Bilim sınavı" },
          date: { kind: "date", label: "Tarih" },
          endDate: { kind: "date", label: "Bitiş (varsa)" },
          time: { kind: "text", label: "Saat", max: 60 },
          note: { kind: "text", label: "Not", max: 500 },
        },
      },
    },
    notes: { kind: "text", label: "Genel notlar", multiline: true, max: 4000 },
    apply_url: { kind: "url", label: "Başvuru adresi" },
    source_url: { kind: "url", label: "Kaynak (ilanın adresi)" },
    source_checked_on: { kind: "date", label: "Kaynağın kontrol edildiği gün" },
  },
};

const RULE_SCHEMA: ObjectNode = {
  kind: "object",
  label: "Genel kural",
  fields: {
    institute: { kind: "text", label: "Enstitü", max: 160 },
    degree: { kind: "enum", label: "Derece", options: entries(DEGREES), required: true },
    details: DETAILS_SCHEMA,
    notes: { kind: "text", label: "Notlar", multiline: true, max: 4000 },
    source_url: { kind: "url", label: "Kaynak" },
  },
};

const LISTING_SCHEMA: ObjectNode = {
  kind: "object",
  label: "İlan",
  fields: {
    program: { ...PROGRAM_SCHEMA, required: true },
    degree: { kind: "enum", label: "Derece", options: entries(DEGREES), required: true },
    mode: { kind: "enum", label: "Öğretim türü", options: entries(MODES) },
    language: { kind: "enum", label: "Öğretim dili", options: entries(TEACHING_LANGUAGES) },
    accepting: { kind: "bool", label: "Bu dönem öğrenci alıyor" },
    application_end: { kind: "datetime", label: "Programa özel son başvuru" },
    details: DETAILS_SCHEMA,
    source_url: { kind: "url", label: "Kaynak" },
  },
};

const DOC_SCHEMA: ObjectNode = {
  kind: "object",
  label: "Dosya",
  fields: {
    format: { kind: "text", label: "Biçim", max: 40, required: true },
    university: { ...UNIVERSITY_SCHEMA, required: true },
    rules: { kind: "list", label: "Genel kurallar", item: RULE_SCHEMA, itemName: "Kural", max: 40 },
    call: CALL_SCHEMA,
    listings: { kind: "list", label: "İlanlar", item: LISTING_SCHEMA, itemName: "İlan", max: 3000 },
  },
};

/* ------------------------------------------------------------------ tipler */

/** Şemadan geçmiş (temizlenmiş) form ya da dosya değerleri: yazılmayan alan yoktur. */
export type RawUniversity = { slug: string; name: string; short_name?: string; city?: string; kind?: UniversityKind; website?: string };
export type RawProgram = { name: string; slug?: string; institute?: string; field?: Field; url?: string };
type RawListing = {
  program: RawProgram;
  degree: Degree;
  mode?: Mode;
  language?: TeachingLanguage;
  accepting?: boolean;
  application_end?: string;
  details?: ListingDetails;
  source_url?: string;
};
export type RawCall = {
  institute?: string;
  academic_year: number;
  semester: Semester;
  title?: string;
  application_start?: string;
  application_end?: string;
  timeline?: TimelineItem[];
  notes?: string;
  apply_url?: string;
  source_url?: string;
  source_checked_on?: string;
};
type RawDoc = {
  format: string;
  university: RawUniversity;
  rules?: { institute?: string; degree: Degree; details?: ListingDetails; notes?: string; source_url?: string }[];
  call?: RawCall;
  listings?: RawListing[];
};

/** Veritabanına yazılacak hâl: varsayılanlar doldurulmuş, filtre sütunları türetilmiş. */
export type ImportUniversity = {
  slug: string;
  name: string;
  short_name: string | null;
  city: string | null;
  kind: UniversityKind | null;
  website: string | null;
};
export type ImportRule = { institute: string; degree: Degree; details: ListingDetails; notes: string | null; source_url: string | null };
export type ImportCall = {
  institute: string;
  academic_year: number;
  semester: Semester;
  title: string;
  application_start: string | null;
  application_end: string | null;
  timeline: TimelineItem[];
  notes: string | null;
  apply_url: string | null;
  source_url: string | null;
  source_checked_on: string | null;
};
export type ImportProgram = { slug: string; name: string; institute: string | null; field: Field | null; url: string | null };
export type ImportListing = DerivedColumns & {
  program: ImportProgram;
  degree: Degree;
  mode: Mode;
  language: TeachingLanguage;
  accepting: boolean;
  application_end: string | null;
  details: ListingDetails;
  source_url: string | null;
};
export type ImportPayload = {
  university: ImportUniversity;
  rules: ImportRule[];
  call: ImportCall | null;
  listings: ImportListing[];
};

export type ParsedImport = { payloads: ImportPayload[]; issues: Issue[] };

/* ------------------------------------------------------------------ okuma ve denetim */

/** Bir ilanı dosya içinde ve veritabanında tanıtan anahtar. */
export function listingKey(l: { program: { slug: string }; degree: string; mode: string; language: string }): string {
  return [l.program.slug, l.degree, l.mode, l.language].join("|");
}

/** Veritabanı satırına çevirir: yazılmayan alanlar boş (null) olur, varsayılanlar doldurulur. Formlar da bunları kullanır. */
export function universityRow(raw: RawUniversity): ImportUniversity {
  return {
    slug: raw.slug,
    name: raw.name,
    short_name: raw.short_name ?? null,
    city: raw.city ?? null,
    kind: raw.kind ?? null,
    website: raw.website ?? null,
  };
}

export function programRow(raw: RawProgram): ImportProgram {
  return {
    slug: raw.slug ?? slugify(raw.name),
    name: raw.name,
    institute: raw.institute ?? null,
    field: raw.field ?? null,
    url: raw.url ?? null,
  };
}

export function callRow(raw: RawCall): ImportCall {
  return {
    institute: raw.institute ?? "",
    academic_year: raw.academic_year,
    semester: raw.semester,
    title: raw.title ?? `${termLabel(raw.academic_year, raw.semester)} Lisansüstü Başvuruları`,
    application_start: raw.application_start ?? null,
    application_end: raw.application_end ?? null,
    timeline: raw.timeline ?? [],
    notes: raw.notes ?? null,
    apply_url: raw.apply_url ?? null,
    source_url: raw.source_url ?? null,
    source_checked_on: raw.source_checked_on ?? null,
  };
}

function toPayload(doc: RawDoc): ImportPayload {
  return {
    university: universityRow(doc.university),
    rules: (doc.rules ?? []).map((r) => ({
      institute: r.institute ?? "",
      degree: r.degree,
      details: r.details ?? {},
      notes: r.notes ?? null,
      source_url: r.source_url ?? null,
    })),
    call: doc.call ? callRow(doc.call) : null,
    listings: (doc.listings ?? []).map((l) => {
      const details = l.details ?? {};
      return {
        program: programRow(l.program),
        degree: l.degree,
        mode: l.mode ?? "orgun",
        language: l.language ?? "tr",
        accepting: l.accepting ?? true,
        application_end: l.application_end ?? null,
        details,
        source_url: l.source_url ?? null,
        ...deriveColumns(details),
      };
    }),
  };
}

/** Bir ilanın şartlarındaki, kaydı engellemeyen ama bakılması gereken durumlar. */
export function reviewDetails(degree: Degree, accepting: boolean, details: ListingDetails, path: string): Issue[] {
  const issues: Issue[] = [];
  const warn = (message: string, at = path) => issues.push({ level: "warning", path: at, message });
  const under = (label: string) => (path ? `${path} › ${label}` : label);
  if (!accepting) return issues;

  const derived = deriveColumns(details);
  if (derived.quota_total === null) warn("Kontenjan yazılmamış.");
  else if (derived.quota_total === 0) warn("Kontenjan 0 görünüyor; program bu dönem öğrenci almıyorsa “alım yok” olarak işaretle.");

  const ales = details.ales;
  const thesis = degree !== "yl-tezsiz";
  if (!ales) {
    if (thesis) warn("ALES şartı yazılmamış.");
  } else if (ales.required) {
    const mins = [derived.ales_say_min, derived.ales_soz_min, derived.ales_ea_min].filter((v): v is number => v !== null);
    if (!mins.length) warn("ALES isteniyor ama puan türü ve alt sınır yazılmamış.", under("ALES"));
    else {
      const lowest = Math.min(...mins);
      if (degree === "butunlesik-doktora" && lowest < 80) {
        warn(`Lisans derecesiyle doktorada yönetmelik en az 80 ALES ister; burada ${lowest} yazıyor.`, under("ALES"));
      } else if (thesis && lowest < 55) {
        warn(`Yönetmelik en az 55 ALES ister; burada ${lowest} yazıyor.`, under("ALES"));
      }
    }
    for (const [i, v] of (ales.variants ?? []).entries()) {
      if (v.gpaMin !== undefined && v.gpaMax !== undefined && v.gpaMin > v.gpaMax) {
        warn("Not ortalaması aralığının alt ucu üst ucundan büyük.", under(`ALES › Koşul ${i + 1}`));
      }
    }
  }

  if (!details.gpa && thesis) warn("Not ortalaması şartı yazılmamış.");

  if ((degree === "doktora" || degree === "butunlesik-doktora") && details.language?.required && derived.yds_min !== null && derived.yds_min < 55) {
    warn(`Doktorada yönetmelik yabancı dilden en az 55 ister; burada ${derived.yds_min} yazıyor.`, under("Yabancı dil"));
  }
  if (details.language?.required && !details.language.rules?.length) warn("Yabancı dil şartı var ama sınav ve puan yazılmamış.", under("Yabancı dil"));

  const weights = details.evaluation?.weights;
  if (weights?.length) {
    const sum = weights.reduce((total, w) => total + w.percent, 0);
    if (Math.abs(sum - 100) > 0.01) warn(`Değerlendirme ağırlıklarının toplamı ${sum}; 100 olmalı.`, under("Değerlendirme"));
  }
  return issues;
}

function reviewDoc(payload: ImportPayload, prefix: string, now: Date): Issue[] {
  const issues: Issue[] = [];
  const at = (label: string) => (prefix ? `${prefix} › ${label}` : label);
  const add = (level: Issue["level"], path: string, message: string) => issues.push({ level, path, message });

  const call = payload.call;
  if (payload.listings.length && !call) {
    add("error", at("Dönem ilanı"), "İlanların hangi döneme ait olduğu yazılmamış (call bölümü eksik).");
  }
  if (call) {
    const start = call.application_start ? Date.parse(call.application_start) : null;
    const end = call.application_end ? Date.parse(call.application_end) : null;
    if (start !== null && end !== null && end < start) add("error", at("Dönem ilanı"), "Son başvuru, başvuru başlangıcından önce.");
    if (start === null || end === null) add("warning", at("Dönem ilanı"), "Başvuru tarihleri eksik.");
    if (end !== null && end < now.getTime()) add("warning", at("Dönem ilanı"), "Son başvuru tarihi geçmiş.");
    if (!call.source_url) add("warning", at("Dönem ilanı"), "Kaynak adresi yazılmamış.");
    for (const [i, item] of call.timeline.entries()) {
      if (item.date && item.endDate && item.endDate < item.date) add("error", at(`Dönem ilanı › Takvim › Tarih ${i + 1}`), "Bitiş, başlangıçtan önce.");
    }
  }

  const seenRules = new Set<string>();
  for (const [i, rule] of payload.rules.entries()) {
    const key = `${rule.institute}|${rule.degree}`;
    if (seenRules.has(key)) add("error", at(`Genel kurallar › Kural ${i + 1}`), "Aynı enstitü ve derece için ikinci bir kural var.");
    seenRules.add(key);
  }

  const seen = new Map<string, number>();
  const names = new Map<string, string>();
  payload.listings.forEach((listing, i) => {
    const path = at(listingLabel(listing, i));
    if (!listing.program.slug) add("error", path, "Program adından kısa ad üretilemedi; dosyada slug yaz.");
    const key = listingKey(listing);
    const first = seen.get(key);
    if (first !== undefined) add("error", path, `Aynı program, derece, öğretim türü ve dil ${first + 1}. ilanda da var.`);
    else seen.set(key, i);
    const known = names.get(listing.program.slug);
    if (known !== undefined && known !== listing.program.name) {
      add("error", path, `“${listing.program.name}” ile “${known}” aynı kısa ada (${listing.program.slug}) düşüyor; birine slug yaz.`);
    } else names.set(listing.program.slug, listing.program.name);

    if (listing.application_end && call?.application_end && Date.parse(listing.application_end) > Date.parse(call.application_end)) {
      add("warning", path, "Programa özel son başvuru, genel son başvurudan sonra.");
    }
    issues.push(...reviewDetails(listing.degree, listing.accepting, listing.details, path));
  });
  return issues;
}

/** "İlan 12 (Bilgisayar Mühendisliği, Doktora)" */
export function listingLabel(listing: { program: { name: string }; degree: Degree }, index: number): string {
  return `İlan ${index + 1} (${listing.program.name}, ${DEGREE_SHORT[listing.degree]})`;
}

/**
 * Dosyanın içeriğini (JSON olarak okunmuş hâlini) denetler ve veritabanına yazılacak hâle getirir.
 * `issues` içinde hata (error) varsa dosya kaydedilmemelidir.
 */
export function parseImport(input: unknown, now: Date = new Date()): ParsedImport {
  const inputs = Array.isArray(input) ? input : [input];
  if (!inputs.length) return { payloads: [], issues: [{ level: "error", path: "", message: "Dosya boş." }] };
  if (inputs.length > 20) return { payloads: [], issues: [{ level: "error", path: "", message: "Bir dosyada en fazla 20 belge olabilir." }] };

  const payloads: ImportPayload[] = [];
  const issues: Issue[] = [];
  inputs.forEach((raw, index) => {
    const prefix = inputs.length > 1 ? `Belge ${index + 1}` : "";
    const { value, issues: found } = check<RawDoc>(DOC_SCHEMA, raw, prefix);
    const rawListings =
      raw && typeof raw === "object" && Array.isArray((raw as { listings?: unknown }).listings)
        ? ((raw as { listings: unknown[] }).listings as { program?: { name?: unknown }; degree?: unknown }[])
        : [];
    // "İlanlar › İlan 12 › …" yerine programın adını da göster.
    for (const issue of found) {
      issue.path = issue.path.replace(/İlanlar › İlan (\d+)/, (_all, n: string) => {
        const item = rawListings[Number(n) - 1];
        const name = typeof item?.program?.name === "string" ? item.program.name.trim() : "";
        const degree = typeof item?.degree === "string" && item.degree in DEGREE_SHORT ? DEGREE_SHORT[item.degree as Degree] : "";
        const extra = [name, degree].filter(Boolean).join(", ");
        return extra ? `İlan ${n} (${extra})` : `İlan ${n}`;
      });
    }
    issues.push(...found);
    if (!value || hasErrors(found)) {
      if (!value && !found.length) issues.push({ level: "error", path: prefix, message: "Belge boş." });
      return;
    }
    if (value.format !== IMPORT_FORMAT) {
      issues.push({ level: "error", path: prefix, message: `Dosya biçimi tanınmadı: "${value.format}". Beklenen: "${IMPORT_FORMAT}".` });
      return;
    }
    const payload = toPayload(value);
    issues.push(...reviewDoc(payload, prefix, now));
    payloads.push(payload);
  });
  return { payloads: hasErrors(issues) ? [] : payloads, issues };
}

/** Dosya metnini okur. JSON bozuksa anlaşılır bir hata döner. */
export function parseImportText(text: string, now: Date = new Date()): ParsedImport {
  const trimmed = text.replace(/^﻿/, "").trim();
  if (!trimmed) return { payloads: [], issues: [{ level: "error", path: "", message: "Dosya boş." }] };
  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch (e) {
    const detail = e instanceof Error ? e.message : "";
    return { payloads: [], issues: [{ level: "error", path: "", message: `Dosya okunamadı: geçerli bir JSON değil. ${detail}`.trim() }] };
  }
  return parseImport(json, now);
}

/* ------------------------------------------------------------------ kayıtlı veriyle karşılaştırma */

export type RowStatus = "yeni" | "degisti" | "ayni";

export type ExistingListing = {
  program_slug: string;
  degree: string;
  mode: string;
  language: string;
  accepting: boolean;
  application_end: string | null;
  details: ListingDetails | null;
  source_url: string | null;
};
export type ExistingState = {
  university: Partial<ImportUniversity> | null;
  call: (Partial<ImportCall> & { status?: string }) | null;
  programs: Partial<ImportProgram>[];
  listings: ExistingListing[];
  rules: Partial<ImportRule>[];
};

export type ImportPlan = {
  university: { status: RowStatus; changes: string[] };
  call: { status: RowStatus; changes: string[]; published: boolean } | null;
  rules: { status: RowStatus }[];
  listings: { status: RowStatus; changes: string[] }[];
  /** Kayıtlı olup dosyada bulunmayan ilan sayısı (bunlara dokunulmaz). */
  untouched: number;
  counts: Record<RowStatus, number>;
};

const DETAIL_LABELS: Record<keyof ListingDetails, string> = {
  quota: "kontenjan",
  ales: "ALES",
  gpa: "not ortalaması",
  language: "yabancı dil",
  background: "alan koşulları",
  exam: "sınav ve mülakat",
  evaluation: "değerlendirme",
  documents: "belgeler",
  prep: "bilimsel hazırlık",
  fee: "ücret",
  contact: "iletişim",
  notes: "notlar",
};

const same = (a: unknown, b: unknown) => stableStringify(a ?? null) === stableStringify(b ?? null);

function fieldChanges<T extends object>(incoming: T, existing: Partial<T>, labels: Partial<Record<keyof T, string>>, dates: (keyof T)[] = []): string[] {
  const changes: string[] = [];
  for (const key of Object.keys(labels) as (keyof T)[]) {
    const a = incoming[key];
    const b = existing[key];
    const equal = dates.includes(key) ? sameInstant(a as string | null, b as string | null | undefined) : same(a, b);
    if (!equal) changes.push(labels[key] as string);
  }
  return changes;
}

/** Dosyadaki kayıtları veritabanındakilerle karşılaştırır: hangisi yeni, hangisi değişecek, hangisi aynı. */
export function planImport(payload: ImportPayload, existing: ExistingState): ImportPlan {
  const counts: Record<RowStatus, number> = { yeni: 0, degisti: 0, ayni: 0 };
  const status = (isNew: boolean, changes: string[]): RowStatus => (isNew ? "yeni" : changes.length ? "degisti" : "ayni");

  const uniChanges = existing.university
    ? fieldChanges(
        payload.university,
        // Dosyada yazmayan alanlar kayıtlı değeri silmez.
        { ...existing.university, ...Object.fromEntries(Object.entries(payload.university).filter(([, v]) => v === null).map(([k]) => [k, null])) },
        { name: "ad", short_name: "kısaltma", city: "şehir", kind: "tür", website: "web sitesi" },
      )
    : [];
  const university = { status: status(!existing.university, uniChanges), changes: uniChanges };

  let call: ImportPlan["call"] = null;
  if (payload.call) {
    const changes = existing.call
      ? fieldChanges(
          payload.call,
          existing.call,
          {
            title: "başlık",
            application_start: "başvuru başlangıcı",
            application_end: "son başvuru",
            timeline: "takvim",
            notes: "notlar",
            apply_url: "başvuru adresi",
            source_url: "kaynak",
            source_checked_on: "kontrol tarihi",
          },
          ["application_start", "application_end"],
        )
      : [];
    call = { status: status(!existing.call, changes), changes, published: existing.call?.status === "yayinda" };
  }

  const rules = payload.rules.map((rule) => {
    const old = existing.rules.find((r) => (r.institute ?? "") === rule.institute && r.degree === rule.degree);
    const changes = old ? fieldChanges(rule, old, { details: "şartlar", notes: "notlar", source_url: "kaynak" }) : [];
    return { status: status(!old, changes) };
  });

  const byKey = new Map(existing.listings.map((l) => [[l.program_slug, l.degree, l.mode, l.language].join("|"), l]));
  const programs = new Map(existing.programs.map((p) => [p.slug, p]));
  const matched = new Set<string>();
  const listings = payload.listings.map((listing) => {
    const key = listingKey(listing);
    const old = byKey.get(key);
    if (!old) {
      counts.yeni++;
      return { status: "yeni" as const, changes: [] };
    }
    matched.add(key);
    const changes: string[] = [];
    if (old.accepting !== listing.accepting) changes.push("alım durumu");
    if (!sameInstant(old.application_end, listing.application_end)) changes.push("son başvuru");
    const oldDetails = old.details ?? {};
    for (const part of Object.keys(DETAIL_LABELS) as (keyof ListingDetails)[]) {
      if (!same(oldDetails[part], listing.details[part])) changes.push(DETAIL_LABELS[part]);
    }
    if (!same(old.source_url, listing.source_url)) changes.push("kaynak");
    const program = programs.get(listing.program.slug);
    if (program) {
      if (program.name !== listing.program.name) changes.push("program adı");
      if (listing.program.institute !== null && program.institute !== listing.program.institute) changes.push("enstitü");
      if (listing.program.field !== null && program.field !== listing.program.field) changes.push("alan");
      if (listing.program.url !== null && program.url !== listing.program.url) changes.push("program sayfası");
    }
    const s = status(false, changes);
    counts[s]++;
    return { status: s, changes };
  });

  return { university, call, rules, listings, untouched: existing.listings.length - matched.size, counts };
}
