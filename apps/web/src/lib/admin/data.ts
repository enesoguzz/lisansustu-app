/**
 * Yönetim panelinin veritabanı işlemleri. Hepsi tarayıcıdan, giriş yapan üyenin oturumuyla çalışır;
 * kimin neyi okuyup yazabileceğini veritabanındaki erişim kuralları belirler (supabase/migrations/0004_listings.sql).
 */
import type {
  Degree,
  DerivedColumns,
  Field,
  ImportCall,
  ImportPayload,
  ImportProgram,
  ImportUniversity,
  ListingDetails,
  Mode,
  TeachingLanguage,
  TimelineItem,
} from "@lisansustu/core";
import { createClient } from "@/lib/supabase/client";

export type University = ImportUniversity & { id: string; updated_at: string };
export type Program = { id: string; university_id: string; slug: string; name: string; institute: string | null; field: Field | null; url: string | null };
export type CallStatus = "taslak" | "yayinda";
export type Call = Omit<ImportCall, "timeline"> & {
  id: string;
  university_id: string;
  timeline: TimelineItem[];
  status: CallStatus;
  published_at: string | null;
  updated_at: string;
};
export type CallOverview = {
  id: string;
  university_id: string;
  university_slug: string;
  university_name: string;
  university_short_name: string | null;
  institute: string;
  academic_year: number;
  semester: Call["semester"];
  title: string;
  application_start: string | null;
  application_end: string | null;
  status: CallStatus;
  published_at: string | null;
  updated_at: string;
  listing_count: number;
  open_count: number;
};
export type Listing = DerivedColumns & {
  id: string;
  university_id: string;
  call_id: string;
  program_id: string;
  degree: Degree;
  mode: Mode;
  language: TeachingLanguage;
  accepting: boolean;
  hidden: boolean;
  application_end: string | null;
  details: ListingDetails;
  source_url: string | null;
  updated_at: string;
};
export type Rule = {
  id: string;
  university_id: string;
  institute: string;
  degree: Degree;
  details: ListingDetails;
  notes: string | null;
  source_url: string | null;
};
export type ImportSummary = {
  university_id: string;
  call_id: string | null;
  university_new: boolean;
  call_new: boolean;
  programs_new: number;
  listings_new: number;
  listings_updated: number;
  listings_unchanged: number;
  rules: number;
};
export type ImportLog = { id: string; created_at: string; file_name: string | null; call_id: string | null; summary: Partial<ImportSummary> };

const UNIVERSITY = "id, slug, name, short_name, city, kind, website, updated_at";
const PROGRAM = "id, university_id, slug, name, institute, field, url";
const CALL =
  "id, university_id, institute, academic_year, semester, title, application_start, application_end, timeline, notes, apply_url, source_url, source_checked_on, status, published_at, updated_at";
const LISTING =
  "id, university_id, call_id, program_id, degree, mode, language, accepting, hidden, application_end, quota_total, ales_required, ales_say_min, ales_soz_min, ales_ea_min, gpa_min4, gpa_min100, lang_required, yds_min, details, source_url, updated_at";
const RULE = "id, university_id, institute, degree, details, notes, source_url";

type Failure = { code?: string; message: string };

/** Veritabanı hatası; `code` PostgreSQL hata kodudur (ör. 23505: aynı kayıt var). */
export class DataError extends Error {
  code: string;
  constructor(failure: Failure) {
    super(failure.message);
    this.code = failure.code ?? "";
  }
}

/** Yöneticiye olduğu gibi gösterilecek hata (ör. formun kendi kontrolü). */
export class UserError extends Error {}

/** Bağlı kayıt yüzünden reddedilen işlem. PostgreSQL 18 ve sonrası "on delete restrict" için 23001, öncekiler 23503 verir. */
const IN_USE = new Set(["23503", "23001"]);

/** Silinmek istenen kayda bağlı başka kayıtlar var mı? */
export function isInUse(error: unknown): boolean {
  return error instanceof DataError && IN_USE.has(error.code);
}

/**
 * Tablo, görünüm ya da fonksiyon veritabanında yok: Adım 3'ün SQL dosyası bu projede henüz çalıştırılmamış.
 * PGRST205 / PGRST202: API'nin bildiği tablolar ve fonksiyonlar arasında yok. 42P01 / 42883: PostgreSQL'in kendi kodları.
 */
const NOT_INSTALLED = new Set(["PGRST205", "PGRST202", "42P01", "42883"]);

/** Hatayı yöneticiye gösterilecek cümleye çevirir. `fallback`: tanınmayan hatalarda söylenecek cümle. */
export function errorMessage(error: unknown, duplicate = "Aynı kayıt zaten var.", fallback = "Kaydedilemedi. Lütfen tekrar dene."): string {
  if (error instanceof UserError) return error.message;
  const code = error instanceof DataError ? error.code : "";
  if (NOT_INSTALLED.has(code)) return "Yönetim panelinin tabloları bu veritabanında henüz kurulmamış. supabase/migrations/0004_listings.sql dosyası Supabase'de çalıştırılınca burası açılır.";
  if (code === "23505") return duplicate;
  if (IN_USE.has(code)) return "Buna bağlı başka kayıtlar olduğu için işlem yapılamadı.";
  if (code === "42501") return "Bu işlem için yetkin yok. Yönetici hesabıyla giriş yaptığından emin ol.";
  if (code === "23514" || code.startsWith("22")) return "Bir alan kurallara uymuyor; değerleri kontrol et.";
  if (code === "") return "Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.";
  return fallback;
}

type Result<T> = { data: T | null; error: Failure | null };

async function unwrap<T>(request: PromiseLike<Result<T>>): Promise<T | null> {
  let result: Result<T>;
  try {
    result = await request;
  } catch {
    throw new DataError({ message: "network" });
  }
  // İstek sunucuya ulaşamadığında istemci kodu boş bir hata döner.
  if (result.error) throw new DataError(result.error.code ? result.error : { message: result.error.message });
  return result.data;
}

const PAGE = 1000;

/** Supabase bir istekte en çok 1000 satır döner; hepsini almak için sayfa sayfa okur. */
async function all<T>(page: (from: number, to: number) => PromiseLike<Result<T[]>>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const chunk = (await unwrap(page(from, from + PAGE - 1))) ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE) return rows;
  }
}

const db = () => createClient();

/* ------------------------------------------------------------------ okuma */

export function listCallOverviews(): Promise<CallOverview[]> {
  return all((from, to) => db().from("call_overview").select("*").order("updated_at", { ascending: false }).order("id").range(from, to).returns<CallOverview[]>());
}

export function listUniversities(): Promise<University[]> {
  return all((from, to) => db().from("universities").select(UNIVERSITY).order("name").order("id").range(from, to).returns<University[]>());
}

export function getUniversity(id: string): Promise<University | null> {
  return unwrap(db().from("universities").select(UNIVERSITY).eq("id", id).maybeSingle<University>());
}

export function getUniversityBySlug(slug: string): Promise<University | null> {
  return unwrap(db().from("universities").select(UNIVERSITY).eq("slug", slug).maybeSingle<University>());
}

export function listPrograms(universityId: string): Promise<Program[]> {
  return all((from, to) => db().from("programs").select(PROGRAM).eq("university_id", universityId).order("name").order("id").range(from, to).returns<Program[]>());
}

export function listRules(universityId: string): Promise<Rule[]> {
  return all((from, to) =>
    db().from("university_rules").select(RULE).eq("university_id", universityId).order("institute").order("degree").range(from, to).returns<Rule[]>(),
  );
}

export function listCalls(universityId: string): Promise<Call[]> {
  return all((from, to) =>
    db().from("calls").select(CALL).eq("university_id", universityId).order("academic_year", { ascending: false }).order("id").range(from, to).returns<Call[]>(),
  );
}

export function getCall(id: string): Promise<Call | null> {
  return unwrap(db().from("calls").select(CALL).eq("id", id).maybeSingle<Call>());
}

export function findCall(universityId: string, key: Pick<Call, "institute" | "academic_year" | "semester">): Promise<Call | null> {
  return unwrap(
    db()
      .from("calls")
      .select(CALL)
      .eq("university_id", universityId)
      .eq("institute", key.institute)
      .eq("academic_year", key.academic_year)
      .eq("semester", key.semester)
      .maybeSingle<Call>(),
  );
}

export function listListings(callId: string): Promise<Listing[]> {
  return all((from, to) => db().from("listings").select(LISTING).eq("call_id", callId).order("id").range(from, to).returns<Listing[]>());
}

export function getListing(id: string): Promise<Listing | null> {
  return unwrap(db().from("listings").select(LISTING).eq("id", id).maybeSingle<Listing>());
}

export function getProgram(id: string): Promise<Program | null> {
  return unwrap(db().from("programs").select(PROGRAM).eq("id", id).maybeSingle<Program>());
}

export async function listImports(limit = 5): Promise<ImportLog[]> {
  const rows = await unwrap(
    db().from("imports").select("id, created_at, file_name, call_id, summary").order("created_at", { ascending: false }).limit(limit).returns<ImportLog[]>(),
  );
  return rows ?? [];
}

/* ------------------------------------------------------------------ yazma */

/** Eklenen ya da değişen satırı geri okur; satır dönmezse (yetki yoksa) hata verir. */
async function one<T>(request: PromiseLike<Result<T>>): Promise<T> {
  const row = await unwrap(request);
  if (!row) throw new DataError({ code: "42501", message: "no row" });
  return row;
}

export function insertUniversity(row: ImportUniversity): Promise<University> {
  return one(db().from("universities").insert(row).select(UNIVERSITY).maybeSingle<University>());
}

export function updateUniversity(id: string, patch: Partial<ImportUniversity>): Promise<University> {
  return one(db().from("universities").update(patch).eq("id", id).select(UNIVERSITY).maybeSingle<University>());
}

export async function deleteUniversity(id: string): Promise<void> {
  await one(db().from("universities").delete().eq("id", id).select("id").maybeSingle<{ id: string }>());
}

export function insertProgram(universityId: string, row: ImportProgram): Promise<Program> {
  return one(db().from("programs").insert({ ...row, university_id: universityId }).select(PROGRAM).maybeSingle<Program>());
}

export function updateProgram(id: string, patch: Partial<ImportProgram>): Promise<Program> {
  return one(db().from("programs").update(patch).eq("id", id).select(PROGRAM).maybeSingle<Program>());
}

export async function deleteProgram(id: string): Promise<void> {
  await one(db().from("programs").delete().eq("id", id).select("id").maybeSingle<{ id: string }>());
}

export function insertCall(universityId: string, row: ImportCall): Promise<Call> {
  return one(db().from("calls").insert({ ...row, university_id: universityId }).select(CALL).maybeSingle<Call>());
}

export function updateCall(id: string, patch: Partial<ImportCall> & { status?: CallStatus }): Promise<Call> {
  return one(db().from("calls").update(patch).eq("id", id).select(CALL).maybeSingle<Call>());
}

export async function deleteCall(id: string): Promise<void> {
  await one(db().from("calls").delete().eq("id", id).select("id").maybeSingle<{ id: string }>());
}

export type ListingInput = DerivedColumns & {
  degree: Degree;
  mode: Mode;
  language: TeachingLanguage;
  accepting: boolean;
  hidden: boolean;
  application_end: string | null;
  details: ListingDetails;
  source_url: string | null;
};

export function insertListing(keys: { university_id: string; call_id: string; program_id: string }, row: ListingInput): Promise<Listing> {
  return one(db().from("listings").insert({ ...row, ...keys }).select(LISTING).maybeSingle<Listing>());
}

export function updateListing(id: string, patch: Partial<ListingInput>): Promise<Listing> {
  return one(db().from("listings").update(patch).eq("id", id).select(LISTING).maybeSingle<Listing>());
}

export async function deleteListing(id: string): Promise<void> {
  await one(db().from("listings").delete().eq("id", id).select("id").maybeSingle<{ id: string }>());
}

export type RuleInput = Pick<Rule, "institute" | "degree" | "details" | "notes" | "source_url">;

export function insertRule(universityId: string, row: RuleInput): Promise<Rule> {
  return one(db().from("university_rules").insert({ ...row, university_id: universityId }).select(RULE).maybeSingle<Rule>());
}

export function updateRule(id: string, patch: Partial<RuleInput>): Promise<Rule> {
  return one(db().from("university_rules").update(patch).eq("id", id).select(RULE).maybeSingle<Rule>());
}

export async function deleteRule(id: string): Promise<void> {
  await one(db().from("university_rules").delete().eq("id", id).select("id").maybeSingle<{ id: string }>());
}

/** Denetlenmiş bir içe aktarma belgesini tek işlemde kaydeder (veritabanındaki admin_import fonksiyonu). */
export function runImport(payload: ImportPayload, fileName: string | null): Promise<ImportSummary> {
  return one(db().rpc("admin_import", { payload, file_name: fileName }) as PromiseLike<Result<ImportSummary>>);
}
