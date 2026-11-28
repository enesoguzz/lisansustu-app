/** Tarih yardımcıları. Sitedeki bütün saatler Türkiye saatiyle (UTC+3, yaz saati uygulaması yok) gösterilir. */

const OFFSET_MS = 3 * 60 * 60 * 1000;
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

/** Kayıtlı zamanı form alanının beklediği biçime çevirir: "2026-12-14T10:00" (Türkiye saati). */
export function toIstanbulInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const time = Date.parse(iso);
  return Number.isNaN(time) ? "" : new Date(time + OFFSET_MS).toISOString().slice(0, 16);
}

/** Form alanındaki Türkiye saatini kaydedilecek biçime çevirir: "2026-12-14T10:00:00+03:00". */
export function fromIstanbulInput(local: string): string | undefined {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) ? `${local}:00+03:00` : undefined;
}

/** "14 Aralık 2026 10.00" */
export function formatDateTime(iso: string | null | undefined): string {
  const local = toIstanbulInput(iso);
  if (!local) return "";
  return `${formatDate(local.slice(0, 10))} ${local.slice(11, 13)}.${local.slice(14, 16)}`;
}

/** "2026-12-25" → "25 Aralık 2026" */
export function formatDate(date: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? "");
  if (!m) return "";
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** İki zaman aynı anı mı gösteriyor? Yazım farkını (saat dilimi, saniye) yok sayar. */
export function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return Date.parse(a) === Date.parse(b);
}
