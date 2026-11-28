"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import {
  DEGREES,
  DETAILS_SCHEMA,
  MODES,
  TEACHING_LANGUAGES,
  check,
  deriveColumns,
  entries,
  formatDateTime,
  hasErrors,
  reviewDetails,
  stableStringify,
  type Degree,
  type Issue,
  type ListingDetails,
  type Mode,
  type ObjectNode,
  type TeachingLanguage,
} from "@lisansustu/core";
import {
  deleteListing,
  errorMessage,
  getCall,
  getListing,
  getProgram,
  getUniversity,
  updateListing,
  type Call,
  type Listing,
  type Program,
  type University,
} from "@/lib/admin/data";
import { callName } from "@/lib/admin/format";
import { useLoad } from "@/lib/admin/use-load";
import { DetailsEditor } from "./details-editor";
import { FIX_MARKED, SchemaForm, errorsByPath, shownIssues } from "./schema-form";
import { Badge, ConfirmButton, Empty, IssueList, Loading, Notice, PageTitle, Panel } from "./ui";

/** İlanın kimliği ve şartlar dışındaki alanları. */
const META: ObjectNode = {
  kind: "object",
  label: "İlan",
  fields: {
    degree: { kind: "enum", label: "Derece", options: entries(DEGREES), required: true },
    mode: { kind: "enum", label: "Öğretim türü", options: entries(MODES), required: true },
    language: { kind: "enum", label: "Öğretim dili", options: entries(TEACHING_LANGUAGES), required: true },
    application_end: { kind: "datetime", label: "Programa özel son başvuru", hint: "Türkiye saatiyle. Boşsa dönem ilanındaki tarih geçerlidir." },
    source_url: { kind: "url", label: "Kaynak", hint: "Programın ilanı ayrı bir sayfadaysa." },
  },
};
type Meta = { degree: Degree; mode: Mode; language: TeachingLanguage; application_end?: string; source_url?: string };

type Loaded = { listing: Listing; call: Call; program: Program; university: University };

function ListingForm({ listing: initial, call, program, university }: Loaded) {
  const router = useRouter();
  const [listing, setListing] = useState(initial);
  const [meta, setMeta] = useState<unknown>(() => ({
    degree: initial.degree,
    mode: initial.mode,
    language: initial.language,
    ...(initial.application_end ? { application_end: initial.application_end } : {}),
    ...(initial.source_url ? { source_url: initial.source_url } : {}),
  }));
  const [details, setDetails] = useState<unknown>(initial.details ?? {});
  const [accepting, setAccepting] = useState(initial.accepting);
  const [hidden, setHidden] = useState(initial.hidden);
  const [tried, setTried] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const checkedMeta = check<Meta>(META, meta);
  const checkedDetails = check<ListingDetails>(DETAILS_SCHEMA, details);
  const issues: Issue[] = [...checkedMeta.issues, ...checkedDetails.issues];
  const invalid = !checkedMeta.value || hasErrors(issues);
  const cleanDetails = checkedDetails.value ?? {};
  const degree = checkedMeta.value?.degree ?? listing.degree;
  const warnings = hasErrors(checkedDetails.issues) ? [] : reviewDetails(degree, accepting, cleanDetails, "");

  const current = stableStringify({ meta: checkedMeta.value ?? null, details: cleanDetails, accepting, hidden });
  const baseline = stableStringify({
    meta: check<Meta>(META, {
      degree: listing.degree,
      mode: listing.mode,
      language: listing.language,
      ...(listing.application_end ? { application_end: listing.application_end } : {}),
      ...(listing.source_url ? { source_url: listing.source_url } : {}),
    }).value,
    details: check<ListingDetails>(DETAILS_SCHEMA, listing.details ?? {}).value ?? {},
    accepting: listing.accepting,
    hidden: listing.hidden,
  });
  const dirty = current !== baseline;
  const live = call.status === "yayinda";
  const back = `/yonetim/donem?id=${call.id}`;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setSaved(false);
    setError("");
    if (!checkedMeta.value || invalid) return;
    setPending(true);
    try {
      const next = await updateListing(listing.id, {
        degree: checkedMeta.value.degree,
        mode: checkedMeta.value.mode,
        language: checkedMeta.value.language,
        application_end: checkedMeta.value.application_end ?? null,
        source_url: checkedMeta.value.source_url ?? null,
        accepting,
        hidden,
        details: cleanDetails,
        ...deriveColumns(cleanDetails),
      });
      setListing(next);
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e, "Bu programın aynı derece, öğretim türü ve dilde başka bir ilanı var."));
    } finally {
      setPending(false);
    }
  }

  const errors = errorsByPath(shownIssues(issues, tried));
  const message = error || (tried && invalid ? FIX_MARKED : "");

  return (
    <form onSubmit={save} noValidate>
      <PageTitle
        title={program.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge>{DEGREES[degree]}</Badge>
            {program.institute && <span>{program.institute}</span>}
            {program.url && (
              <a href={program.url} target="_blank" rel="noopener noreferrer" className="text-navy underline">
                Program sayfası
              </a>
            )}
          </span>
        }
        back={{ href: back, label: callName(call, university) }}
      >
        <ConfirmButton
          danger
          label="İlanı sil"
          question="Bu ilan silinecek; geri alınamaz."
          confirmLabel="Evet, sil"
          onConfirm={async () => {
            setError("");
            try {
              await deleteListing(listing.id);
              router.replace(back);
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        />
      </PageTitle>

      <div className="space-y-6">
        {live && <Notice tone="info">Bu ilan yayında: kaydettiğin anda değişiklikler herkese görünür.</Notice>}

        <Panel title="Durum">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div role="group" aria-label="Alım durumu" className="inline-flex overflow-hidden rounded-xl border-2 border-navy-soft">
              {[
                ["Bu dönem öğrenci alıyor", true] as const,
                ["Bu dönem alım yok", false] as const,
              ].map(([label, value]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={accepting === value}
                  onClick={() => setAccepting(value)}
                  className={clsx("px-4 py-2 text-sm font-extrabold transition-colors", accepting === value ? "bg-navy text-white" : "bg-white text-navy-muted hover:bg-navy-soft")}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-navy">
              <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} className="h-5 w-5 accent-[var(--navy)]" />
              Sitede gösterme (gizle)
            </label>
          </div>
          <div className="mt-4">
            <SchemaForm node={META} value={meta} onChange={setMeta} errors={errors} />
          </div>
          <p className="mt-3 text-xs font-semibold text-navy-muted">Son kayıt: {formatDateTime(listing.updated_at)}</p>
        </Panel>

        <Panel title="Şartlar ve ayrıntılar">
          {!accepting && (
            <div className="mb-4">
              <Notice tone="info">Alım olmayan ilanda şartlar zorunlu değildir; yazılanlar yine de saklanır.</Notice>
            </div>
          )}
          {warnings.length > 0 && (
            <div className="mb-4">
              <IssueList issues={warnings} level="warning" title="Göz atılması gerekenler" />
            </div>
          )}
          <DetailsEditor value={details} onChange={setDetails} errors={errors} />
        </Panel>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t-2 border-navy-soft bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? "Kaydediliyor..." : "Kaydet"}
          </button>
          <Link href={back} className="btn btn-outline btn-sm">
            Listeye dön
          </Link>
          <p role="status" className={clsx("w-full text-sm font-bold empty:hidden sm:w-auto sm:min-w-0 sm:flex-1", message ? "text-red-700" : "text-navy-muted")}>
            {message || (dirty ? "Kaydedilmemiş değişiklikler var." : saved ? "Kaydedildi." : "")}
          </p>
        </div>
      </div>
    </form>
  );
}

export function ListingPage() {
  const id = useSearchParams().get("id");
  const { data, error, loading } = useLoad(id, async (): Promise<Loaded | null> => {
    const listing = await getListing(id!);
    if (!listing) return null;
    const [call, program, university] = await Promise.all([getCall(listing.call_id), getProgram(listing.program_id), getUniversity(listing.university_id)]);
    return call && program && university ? { listing, call, program, university } : null;
  });

  if (!id) {
    return (
      <>
        <PageTitle title="İlan seçilmedi" back={{ href: "/yonetim", label: "Yönetim" }} />
        <Empty>Bir dönem ilanının içinden düzenlemek istediğin ilanı seç.</Empty>
      </>
    );
  }
  if (loading) return <Loading />;
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) {
    return (
      <>
        <PageTitle title="İlan bulunamadı" back={{ href: "/yonetim", label: "Yönetim" }} />
        <Empty>Bu ilan silinmiş olabilir.</Empty>
      </>
    );
  }
  return <ListingForm key={data.listing.id} {...data} />;
}
