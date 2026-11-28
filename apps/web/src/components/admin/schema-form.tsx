"use client";

import { useId, useState } from "react";
import clsx from "clsx";
import { fromIstanbulInput, toIstanbulInput, type FieldNode, type Issue, type ListNode, type ObjectNode, type SchemaNode } from "@lisansustu/core";

/**
 * Şemadan form çizer (packages/core/src/schema.ts). İçe aktarma dosyasını denetleyen tanımla aynı tanımı kullanır;
 * böylece formda yazılabilen her şey dosyada da geçerlidir.
 *
 * Değer düz bir JSON ağacıdır. Denetim `check()` ile yapılır; hatalar alanların okunur yoluna göre
 * ("ALES › Seçenek 1 › Alt sınır") eşleştirilip ilgili alanın altında gösterilir.
 */

export type IssueMap = Map<string, string[]>;

/** Hataları alan yoluna göre gruplar. */
export function errorsByPath(issues: Issue[]): IssueMap {
  const map: IssueMap = new Map();
  for (const issue of issues) {
    if (issue.level !== "error") continue;
    map.set(issue.path, [...(map.get(issue.path) ?? []), issue.message]);
  }
  return map;
}

export const FIX_MARKED = "Kırmızıyla işaretli alanları düzelt.";

/** Yazım hataları yazarken, "zorunlu" uyarıları kaydetmeyi deneyince gösterilir. */
export function shownIssues(issues: Issue[], tried: boolean): Issue[] {
  return tried ? issues : issues.filter((issue) => issue.message !== "Bu alan zorunlu.");
}

/** `check()` ile aynı kural: üst yol ile alan adını birleştirir. */
export function joinPath(path: string, label: string): string {
  return path ? `${path} › ${label}` : label;
}

type Props = {
  node: SchemaNode;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Alanın okunur yolu; `check()` aynı yolu üretir. */
  path: string;
  errors: IssueMap;
  required?: boolean;
  disabled?: boolean;
  /** Başlığı gizle (üst bileşen zaten gösteriyorsa). */
  bare?: boolean;
};

const INPUT =
  "w-full rounded-xl border-2 border-navy-soft bg-white px-3 py-2 text-sm font-semibold text-navy outline-none transition-colors placeholder:text-navy-muted/50 focus:border-navy disabled:bg-navy-soft/60 disabled:text-navy-muted";

function Messages({ errors, path }: { errors: IssueMap; path: string }) {
  const found = errors.get(path);
  if (!found) return null;
  return (
    <p role="alert" className="mt-1 text-xs font-bold text-red-700">
      {found.join(" ")}
    </p>
  );
}

function Label({ htmlFor, node, required }: { htmlFor?: string; node: SchemaNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-extrabold text-navy">
      {node.label}
      {required && <span className="font-bold text-navy-muted"> (zorunlu)</span>}
    </label>
  );
}

function Hint({ node }: { node: SchemaNode }) {
  return node.hint ? <p className="mt-1 text-xs font-semibold text-navy-muted">{node.hint}</p> : null;
}

/* ------------------------------------------------------------------ sayı */

function numberText(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value).replace(".", ",") : "";
}

/** Boş: yazılmamış. Geçersiz yazım NaN olur ve denetimde "sayı olmalı" hatası verir. */
function parseNumber(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  return /^-?\d+([.,]\d+)?[.,]?$/.test(trimmed) ? Number(trimmed.replace(",", ".").replace(/\.$/, "")) : Number.NaN;
}

const sameNumber = (a: unknown, b: unknown) => a === b || (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b));

function NumberInput({ id, value, onChange, disabled, invalid }: { id: string; value: unknown; onChange: (value: unknown) => void; disabled?: boolean; invalid: boolean }) {
  const [text, setText] = useState(() => numberText(value));
  // Değer dışarıdan değiştiyse (ör. kayıttan sonra) yazılan metin yerine onu göster.
  const shown = sameNumber(parseNumber(text), value ?? undefined) ? text : numberText(value);
  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      disabled={disabled}
      aria-invalid={invalid}
      value={shown}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseNumber(e.target.value));
      }}
      className={clsx(INPUT, invalid && "!border-red-400")}
    />
  );
}

/* ------------------------------------------------------------------ tek değerli alanlar */

function ScalarField({ node, value, onChange, path, errors, required, disabled, bare }: Props) {
  const id = useId();
  const invalid = errors.has(path);
  const common = { id, disabled, "aria-invalid": invalid, className: clsx(INPUT, invalid && "!border-red-400") };
  const text = typeof value === "string" ? value : "";
  let control: React.ReactNode;

  switch (node.kind) {
    case "text":
      control = node.multiline ? (
        <textarea {...common} rows={3} value={text} placeholder={node.placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...common} type="text" value={text} placeholder={node.placeholder} onChange={(e) => onChange(e.target.value)} />
      );
      break;
    case "url":
      control = <input {...common} type="text" inputMode="url" value={text} placeholder="https://" onChange={(e) => onChange(e.target.value)} />;
      break;
    case "slug":
      control = <input {...common} type="text" autoCapitalize="none" spellCheck={false} value={text} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "number":
      control = <NumberInput id={id} value={value} onChange={onChange} disabled={disabled} invalid={invalid} />;
      break;
    case "date":
      control = <input {...common} type="date" value={text} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "datetime":
      // Saat her zaman Türkiye saatiyle yazılır ve gösterilir.
      control = (
        <input
          {...common}
          type="datetime-local"
          value={toIstanbulInput(text)}
          onChange={(e) => onChange(e.target.value === "" ? undefined : (fromIstanbulInput(e.target.value) ?? e.target.value))}
        />
      );
      break;
    case "enum":
      control = (
        <select {...common} value={text} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}>
          <option value="">Seçilmedi</option>
          {node.options.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      );
      break;
    case "bool": {
      const options: [string, unknown][] = [
        ["Belirtilmedi", undefined],
        ["Evet", true],
        ["Hayır", false],
      ];
      control = (
        <div role="group" aria-labelledby={`${id}-label`} className="inline-flex overflow-hidden rounded-xl border-2 border-navy-soft">
          {options.map(([label, option]) => {
            const active = (value ?? undefined) === option;
            return (
              <button
                key={label}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                onClick={() => onChange(option)}
                className={clsx("px-3 py-2 text-xs font-extrabold transition-colors", active ? "bg-navy text-white" : "bg-white text-navy-muted hover:bg-navy-soft")}
              >
                {label}
              </button>
            );
          })}
        </div>
      );
      break;
    }
    default:
      control = null;
  }

  const wide = node.kind === "text" && node.multiline;
  return (
    <div className={clsx(wide && "col-span-full")}>
      {!bare &&
        (node.kind === "bool" ? (
          <p id={`${id}-label`} className="mb-1 block text-xs font-extrabold text-navy">
            {node.label}
            {required && <span className="font-bold text-navy-muted"> (zorunlu)</span>}
          </p>
        ) : (
          <Label htmlFor={id} node={node} required={required} />
        ))}
      {control}
      {node.kind === "datetime" && !node.hint && <p className="mt-1 text-xs font-semibold text-navy-muted">Türkiye saatiyle.</p>}
      <Hint node={node} />
      <Messages errors={errors} path={path} />
    </div>
  );
}

/* ------------------------------------------------------------------ liste ve nesne */

function emptyItem(node: SchemaNode): unknown {
  return node.kind === "object" ? {} : node.kind === "list" ? [] : undefined;
}

function ListField({ node, value, onChange, path, errors, disabled, bare, required }: Props & { node: ListNode }) {
  const rows = Array.isArray(value) ? value : [];
  const itemName = node.itemName ?? "Satır";
  const full = rows.length >= (node.max ?? 200);
  return (
    <div className="col-span-full">
      {!bare && (
        <p className="mb-1 text-xs font-extrabold text-navy">
          {node.label}
          {required && <span className="font-bold text-navy-muted"> (zorunlu)</span>}
        </p>
      )}
      <Hint node={node} />
      <div className="mt-2 space-y-2">
        {rows.map((row, index) => (
          <div key={index} className="flex items-start gap-2 rounded-2xl bg-navy-soft/50 p-3">
            <div className="min-w-0 flex-1">
              <SchemaField
                node={node.item}
                value={row}
                onChange={(next) => onChange(rows.map((r, i) => (i === index ? next : r)))}
                path={joinPath(path, `${itemName} ${index + 1}`)}
                errors={errors}
                disabled={disabled}
                bare
              />
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
              aria-label={`${itemName} ${index + 1}: sil`}
              className="mt-5 shrink-0 rounded-lg px-2 py-1 text-xs font-extrabold text-red-700 hover:bg-red-50"
            >
              Sil
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={disabled || full}
        onClick={() => onChange([...rows, emptyItem(node.item)])}
        className="mt-2 rounded-xl border-2 border-dashed border-navy-soft px-3 py-1.5 text-xs font-extrabold text-navy hover:bg-navy-soft disabled:opacity-50"
      >
        + {itemName} ekle
      </button>
      <Messages errors={errors} path={path} />
    </div>
  );
}

function ObjectField({ node, value, onChange, path, errors, disabled, bare, required }: Props & { node: ObjectNode }) {
  const record = value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return (
    <div className="col-span-full">
      {!bare && (
        <p className="mb-2 text-sm font-black text-navy">
          {node.label}
          {required && <span className="text-xs font-bold text-navy-muted"> (zorunlu)</span>}
        </p>
      )}
      <Hint node={node} />
      <div className={clsx("grid gap-3", node.inline ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2")}>
        {Object.entries(node.fields).map(([key, field]: [string, FieldNode]) => (
          <SchemaField
            key={key}
            node={field}
            value={record[key]}
            onChange={(next) => onChange({ ...record, [key]: next })}
            path={joinPath(path, field.label)}
            errors={errors}
            required={field.required}
            disabled={disabled}
          />
        ))}
      </div>
      <Messages errors={errors} path={path} />
    </div>
  );
}

export function SchemaField(props: Props) {
  if (props.node.kind === "object") return <ObjectField {...props} node={props.node} />;
  if (props.node.kind === "list") return <ListField {...props} node={props.node} />;
  return <ScalarField {...props} />;
}

/** Şemadaki alanlardan yalnızca verilenleri kilitleyerek (ör. sonradan değişmemesi gereken kısa ad) form çizer. */
export function SchemaForm({
  node,
  value,
  onChange,
  errors,
  locked = [],
}: {
  node: ObjectNode;
  value: unknown;
  onChange: (value: unknown) => void;
  errors: IssueMap;
  locked?: string[];
}) {
  const record = value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Object.entries(node.fields).map(([key, field]: [string, FieldNode]) => (
        <SchemaField
          key={key}
          node={field}
          value={record[key]}
          onChange={(next) => onChange({ ...record, [key]: next })}
          path={field.label}
          errors={errors}
          required={field.required}
          disabled={locked.includes(key)}
        />
      ))}
    </div>
  );
}
