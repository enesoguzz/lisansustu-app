import { DEGREES, termLabel, type Degree, type Semester } from "@lisansustu/core";
import type { Listing, Program } from "./data";

const DEGREE_ORDER = Object.keys(DEGREES) as Degree[];
const collator = new Intl.Collator("tr");

/** "Boğaziçi · 2026-2027 Bahar" (enstitüye özel ilanlarda enstitü adıyla) */
export function callName(call: { academic_year: number; semester: Semester; institute: string }, university: { name: string; short_name?: string | null }): string {
  return [university.short_name || university.name, termLabel(call.academic_year, call.semester), call.institute].filter(Boolean).join(" · ");
}

/** İlanları enstitü, program adı ve derece sırasıyla dizer. */
export function sortListings<T extends Pick<Listing, "program_id" | "degree" | "mode" | "language">>(listings: T[], programs: Map<string, Program>): T[] {
  return [...listings].sort((a, b) => {
    const pa = programs.get(a.program_id);
    const pb = programs.get(b.program_id);
    return (
      collator.compare(pa?.institute ?? "", pb?.institute ?? "") ||
      collator.compare(pa?.name ?? "", pb?.name ?? "") ||
      DEGREE_ORDER.indexOf(a.degree) - DEGREE_ORDER.indexOf(b.degree) ||
      collator.compare(a.mode, b.mode) ||
      collator.compare(a.language, b.language)
    );
  });
}

export function compareText(a: string, b: string): number {
  return collator.compare(a, b);
}

/** Arama kutusu için: büyük/küçük harf ve Türkçe karakter farkını yok sayar. */
export function searchable(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
}
