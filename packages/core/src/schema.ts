/**
 * Küçük bir veri şeması aracı. Aynı tanım iki işe yarar:
 * içe aktarılan dosyanın denetlenmesi ve yönetim panelindeki formların çizilmesi.
 * Böylece formun yazabildiği her şey dosyada da geçerlidir, dosyadaki her şey formda düzenlenebilir.
 */

export type Issue = {
  /** error: kaydı engeller. warning: gözden geçirilmesi gereken ama kaydı engellemeyen durum. */
  level: "error" | "warning";
  /** Sorunun yeri, okunur biçimde: "İlan 3 › ALES › Seçenek 1 › Alt sınır" */
  path: string;
  message: string;
};

type Base = { label: string; hint?: string };

export type TextNode = Base & { kind: "text"; max?: number; multiline?: boolean; placeholder?: string };
export type NumberNode = Base & { kind: "number"; min?: number; max?: number; integer?: boolean; step?: number };
export type BoolNode = Base & { kind: "bool" };
export type EnumNode = Base & { kind: "enum"; options: readonly (readonly [string, string])[] };
/** YYYY-AA-GG */
export type DateNode = Base & { kind: "date" };
/** Saat dilimiyle birlikte tarih ve saat: 2026-12-14T10:00:00+03:00 */
export type DateTimeNode = Base & { kind: "datetime" };
export type UrlNode = Base & { kind: "url" };
/** Küçük harf, rakam ve tire: "bogazici" */
export type SlugNode = Base & { kind: "slug" };
export type ListNode = Base & { kind: "list"; item: SchemaNode; max?: number; itemName?: string };
export type ObjectNode = Base & { kind: "object"; fields: Record<string, FieldNode>; inline?: boolean };

export type SchemaNode =
  | TextNode
  | NumberNode
  | BoolNode
  | EnumNode
  | DateNode
  | DateTimeNode
  | UrlNode
  | SlugNode
  | ListNode
  | ObjectNode;

export type FieldNode = SchemaNode & { required?: boolean };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d && y >= 2000 && y <= 2100;
}

export function isValidDateTime(value: string): boolean {
  return DATETIME_RE.test(value) && isValidDate(value.slice(0, 10)) && !Number.isNaN(Date.parse(value));
}

/** Hiçbir şey yazılmamış mı? Formdaki boş satırlar ve boş bölümler hata sayılmaz, yok sayılır. */
function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.every(isBlank);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).every(isBlank);
  return false;
}

function join(path: string, label: string): string {
  return path ? `${path} › ${label}` : label;
}

function walk(node: SchemaNode, input: unknown, path: string, issues: Issue[], root = false): unknown {
  // Boş bırakılan isteğe bağlı bölüm yok sayılır. Kök nesne boş olsa da zorunlu alanları bildirilir.
  if (isBlank(input)) {
    if (!root || node.kind !== "object") return undefined;
    input = {};
  }
  const fail = (message: string) => {
    issues.push({ level: "error", path, message });
    return undefined;
  };

  switch (node.kind) {
    case "text": {
      if (typeof input !== "string") return fail("Metin olmalı (tırnak içinde).");
      const text = node.multiline
        ? input
            .replace(/\r\n?/g, "\n")
            .split("\n")
            .map((line) => line.replace(/[ \t]+/g, " ").trim())
            .join("\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim()
        : input.replace(/\s+/g, " ").trim();
      const max = node.max ?? (node.multiline ? 4000 : 300);
      if (text.length > max) return fail(`En fazla ${max} karakter olabilir (şu an ${text.length}).`);
      return text === "" ? undefined : text;
    }
    case "number": {
      if (typeof input !== "number" || !Number.isFinite(input)) return fail("Sayı olmalı.");
      if (node.integer && !Number.isInteger(input)) return fail("Tam sayı olmalı.");
      if (node.min !== undefined && input < node.min) return fail(`En az ${node.min} olabilir.`);
      if (node.max !== undefined && input > node.max) return fail(`En fazla ${node.max} olabilir.`);
      return input;
    }
    case "bool":
      if (typeof input !== "boolean") return fail("true ya da false olmalı.");
      return input;
    case "enum": {
      if (typeof input !== "string" || !node.options.some(([key]) => key === input)) {
        return fail(`Şunlardan biri olmalı: ${node.options.map(([key]) => key).join(", ")}.`);
      }
      return input;
    }
    case "date":
      if (typeof input !== "string" || !isValidDate(input.trim())) return fail("Tarih YYYY-AA-GG biçiminde olmalı (ör. 2026-12-21).");
      return input.trim();
    case "datetime":
      if (typeof input !== "string" || !isValidDateTime(input.trim())) {
        return fail("Tarih ve saat, saat dilimiyle yazılmalı (ör. 2026-12-21T17:00:00+03:00).");
      }
      return input.trim();
    case "url": {
      if (typeof input !== "string") return fail("Adres metin olmalı.");
      const text = input.trim();
      let ok = text.length <= 500 && /^https?:\/\//i.test(text);
      if (ok) {
        try {
          new URL(text);
        } catch {
          ok = false;
        }
      }
      if (!ok) return fail("Adres http:// ya da https:// ile başlamalı ve en fazla 500 karakter olmalı.");
      return text;
    }
    case "slug": {
      if (typeof input !== "string" || !SLUG_RE.test(input) || input.length > 80) {
        return fail("Yalnızca küçük harf, rakam ve tire içermeli (ör. bogazici).");
      }
      return input;
    }
    case "list": {
      if (!Array.isArray(input)) return fail("Liste olmalı (köşeli parantez içinde).");
      const max = node.max ?? 200;
      if (input.length > max) return fail(`En fazla ${max} satır olabilir (şu an ${input.length}).`);
      const out: unknown[] = [];
      input.forEach((item, i) => {
        const value = walk(node.item, item, join(path, `${node.itemName ?? "Satır"} ${i + 1}`), issues);
        if (value !== undefined) out.push(value);
      });
      return out.length ? out : undefined;
    }
    case "object": {
      if (typeof input !== "object" || Array.isArray(input)) return fail("Alanlardan oluşmalı (süslü parantez içinde).");
      const source = input as Record<string, unknown>;
      for (const key of Object.keys(source)) {
        if (!(key in node.fields)) issues.push({ level: "error", path, message: `Tanınmayan alan: "${key}".` });
      }
      const out: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(node.fields)) {
        const childPath = join(path, field.label);
        const value = walk(field, source[key], childPath, issues);
        if (value !== undefined) out[key] = value;
        else if (field.required && !issues.some((i) => i.level === "error" && i.path.startsWith(childPath))) {
          issues.push({ level: "error", path: childPath, message: "Bu alan zorunlu." });
        }
      }
      return Object.keys(out).length ? out : undefined;
    }
  }
}

/**
 * Değeri şemaya göre denetler ve temizler (boşlukları atar, boş alanları çıkarır).
 * Hata varsa `issues` içinde döner; `value` yalnızca hata yokken güvenilirdir.
 */
export function check<T = unknown>(node: SchemaNode, input: unknown, path = ""): { value: T | undefined; issues: Issue[] } {
  const issues: Issue[] = [];
  const value = walk(node, input, path, issues, true) as T | undefined;
  return { value, issues };
}

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((i) => i.level === "error");
}
