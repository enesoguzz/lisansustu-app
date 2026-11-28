/** Metin yardımcıları. */

const TR_MAP: Record<string, string> = {
  ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", I: "i", İ: "i", i: "i", ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u",
  â: "a", Â: "a", î: "i", Î: "i", û: "u", Û: "u",
};

/**
 * Adresten ve dosyadan tanınacak kısa ad üretir: "Elektrik - Elektronik Mühendisliği" → "elektrik-elektronik-muhendisligi".
 * Aynı metin her zaman aynı sonucu verir; içe aktarmada kayıtlar bu adla eşleştirilir.
 */
export function slugify(input: string): string {
  return Array.from(input.normalize("NFC"))
    .map((ch) => TR_MAP[ch] ?? ch)
    .join("")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " ve ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** Tek satırlık metinde art arda boşlukları teke indirir, baştaki ve sondaki boşlukları atar. */
export function squish(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

/** Sayıyı Türkçe yazımıyla (ondalık virgül) gösterir: 2.5 → "2,50". */
export function formatNumber(value: number, decimals?: number): string {
  const d = decimals ?? (Number.isInteger(value) ? 0 : Math.min(2, (String(value).split(".")[1] ?? "").length));
  return value.toFixed(d).replace(".", ",");
}

/** Anahtarları sıralayıp yazar; iki değerin aynı olup olmadığını karşılaştırmak için. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}
