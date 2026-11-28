"use client";

import { useState } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import {
  DETAILS_SCHEMA,
  alesSummary,
  check,
  gpaSummary,
  languageSummary,
  quotaSummary,
  type FieldNode,
  type ListingDetails,
} from "@lisansustu/core";
import { Badge } from "./ui";
import { SchemaField, joinPath, type IssueMap } from "./schema-form";

/** Bölümün kapalıyken görünen kısa özeti. Yarım yazılmış değerlerde boş döner. */
function summarize(key: keyof ListingDetails, details: ListingDetails): string {
  try {
    switch (key) {
      case "quota":
        return quotaSummary(details.quota);
      case "ales":
        return alesSummary(details.ales);
      case "gpa":
        return gpaSummary(details.gpa);
      case "language":
        return languageSummary(details.language);
      case "documents":
        return details.documents?.length ? `${details.documents.length} belge` : "";
      case "evaluation":
        return (details.evaluation?.weights ?? []).map((w) => `${w.item} %${w.percent}`).join(", ");
      case "exam":
        return [details.exam?.written && "Yazılı", details.exam?.interview && "Mülakat"].filter(Boolean).join(" + ") || (details.exam ? "Not var" : "");
      case "prep":
      case "notes": {
        const text = details[key] ?? "";
        return text.length > 70 ? `${text.slice(0, 70)}…` : text;
      }
      default:
        return details[key] ? "Dolu" : "";
    }
  } catch {
    return "";
  }
}

/**
 * Bir ilanın (ya da genel kuralın) şartlarını düzenler. Her başlık kapalıyken özetini gösterir.
 * `value` formdaki ham hâldir; kaydetmeden önce `check(DETAILS_SCHEMA, value)` ile temizlenir.
 */
export function DetailsEditor({
  value,
  onChange,
  errors,
  path = "",
  disabled,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  errors: IssueMap;
  /** Hata yollarının öneki (form başka bir şemanın içindeyse). */
  path?: string;
  disabled?: boolean;
}) {
  const record = value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const cleaned = check<ListingDetails>(DETAILS_SCHEMA, record).value ?? {};
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="space-y-2">
      {(Object.entries(DETAILS_SCHEMA.fields) as [keyof ListingDetails, FieldNode][]).map(([key, field]) => {
        const sectionPath = joinPath(path, field.label);
        const errorCount = [...errors.keys()].filter((p) => p === sectionPath || p.startsWith(`${sectionPath} › `)).length;
        const summary = summarize(key, cleaned);
        // Hatası olan bölüm kapalı kalmasın.
        const isOpen = open.has(key) || errorCount > 0;
        return (
          <div key={key} className={clsx("rounded-2xl border-2", errorCount ? "border-red-300" : "border-navy-soft")}>
            <button type="button" onClick={() => toggle(key)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left">
              <span className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
                <span className="block text-sm font-black text-navy sm:w-44 sm:shrink-0">{field.label}</span>
                <span className={clsx("block truncate text-sm font-semibold sm:min-w-0 sm:flex-1", summary ? "text-navy" : "text-navy-muted/70")}>{summary || "Yazılmamış"}</span>
              </span>
              {errorCount > 0 && <Badge tone="error">{errorCount} hata</Badge>}
              <ChevronDown className={clsx("h-5 w-5 shrink-0 text-navy-muted transition-transform", isOpen && "rotate-180")} aria-hidden />
            </button>
            {isOpen && (
              <div className="border-t-2 border-navy-soft px-4 py-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <SchemaField
                    node={field}
                    value={record[key]}
                    onChange={(next) => onChange({ ...record, [key]: next })}
                    path={sectionPath}
                    errors={errors}
                    disabled={disabled}
                    bare
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
