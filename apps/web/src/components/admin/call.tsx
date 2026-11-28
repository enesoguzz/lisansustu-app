"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  CALL_SCHEMA,
  DEGREES,
  DEGREE_SHORT,
  MODES,
  TEACHING_LANGUAGES,
  callRow,
  check,
  deriveColumns,
  entries,
  formatDate,
  formatDateTime,
  hasErrors,
  programRow,
  reviewDetails,
  type Degree,
  type ImportCall,
  type Mode,
  type ObjectNode,
  type RawCall,
  type TeachingLanguage,
} from "@lisansustu/core";
import {
  deleteCall,
  errorMessage,
  getCall,
  getUniversity,
  insertCall,
  insertListing,
  insertProgram,
  listListings,
  listPrograms,
  updateCall,
  updateListing,
  type Call,
  type Listing,
  type Program,
  type University,
} from "@/lib/admin/data";
import { callName, compareText, searchable, sortListings } from "@/lib/admin/format";
import { useLoad } from "@/lib/admin/use-load";
import { Badge, ConfirmButton, Empty, Loading, Notice, PageTitle, Panel } from "./ui";
import { RequirementCells, RequirementHeads } from "./listing-cells";
import { FIX_MARKED, SchemaForm, errorsByPath, shownIssues } from "./schema-form";

/* ------------------------------------------------------------------ dönem ilanı formu */

function callToRaw(call: Call): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const key of Object.keys(CALL_SCHEMA.fields)) {
    const value = (call as unknown as Record<string, unknown>)[key];
    if (value !== null && value !== "") raw[key] = value;
  }
  return raw;
}

function CallForm({ initial, submitLabel, onSubmit, onCancel }: { initial?: Call; submitLabel: string; onSubmit: (row: ImportCall) => Promise<void>; onCancel?: () => void }) {
  const [raw, setRaw] = useState<unknown>(() => (initial ? callToRaw(initial) : { academic_year: new Date().getFullYear() }));
  const [tried, setTried] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const { value, issues } = check<RawCall>(CALL_SCHEMA, raw);
  if (value?.application_start && value.application_end && Date.parse(value.application_end) < Date.parse(value.application_start)) {
    issues.push({ level: "error", path: "Son başvuru", message: "Başvuru başlangıcından önce olamaz." });
  }
  const invalid = !value || hasErrors(issues);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setError("");
    if (!value || invalid) return;
    setPending(true);
    try {
      await onSubmit(callRow(value));
    } catch (e) {
      setError(errorMessage(e, "Bu üniversitenin bu dönemi için zaten bir ilan var."));
    } finally {
      setPending(false);
    }
  }

  const message = error || (tried && invalid ? FIX_MARKED : "");
  return (
    <form onSubmit={submit} noValidate>
      <SchemaForm node={CALL_SCHEMA} value={raw} onChange={setRaw} errors={errorsByPath(shownIssues(issues, tried))} />
      {message && (
        <div className="mt-4">
          <Notice tone="error">{message}</Notice>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
          {pending ? "Bekle..." : submitLabel}
        </button>
        {onCancel && (
          <button type="button" disabled={pending} onClick={onCancel} className="btn btn-outline btn-sm">
            Vazgeç
          </button>
        )}
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ yeni ilan ekleme */

const NEW_LISTING: ObjectNode = {
  kind: "object",
  label: "Yeni ilan",
  fields: {
    degree: { kind: "enum", label: "Derece", options: entries(DEGREES), required: true },
    mode: { kind: "enum", label: "Öğretim türü", options: entries(MODES), required: true },
    language: { kind: "enum", label: "Öğretim dili", options: entries(TEACHING_LANGUAGES), required: true },
  },
};

const NEW_PROGRAM = "__yeni__";

function AddListing({ call, programs, onCancel }: { call: Call; programs: Program[]; onCancel: () => void }) {
  const router = useRouter();
  const [programId, setProgramId] = useState(programs.length ? "" : NEW_PROGRAM);
  const [name, setName] = useState("");
  const [institute, setInstitute] = useState(call.institute);
  const [raw, setRaw] = useState<unknown>({ mode: "orgun", language: "tr" });
  const [tried, setTried] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const { value, issues } = check<{ degree: Degree; mode: Mode; language: TeachingLanguage }>(NEW_LISTING, raw);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setError("");
    if (programId === "") return setError("Programı seç.");
    const row = programId === NEW_PROGRAM ? programRow({ name: name.trim().replace(/\s+/g, " "), institute: institute.trim() || undefined }) : null;
    if (row && row.name.length < 2) return setError("Programın adını yaz.");
    if (row && !row.slug) return setError("Program adından adres adı üretilemedi; adında harf ya da rakam olmalı.");
    if (!value || hasErrors(issues)) return setError(FIX_MARKED);

    setPending(true);
    try {
      const existing = row ? programs.find((p) => p.slug === row.slug) : undefined;
      const program = row ? (existing ?? (await insertProgram(call.university_id, row))) : programs.find((p) => p.id === programId)!;
      const listing = await insertListing(
        { university_id: call.university_id, call_id: call.id, program_id: program.id },
        { ...value, accepting: true, hidden: false, application_end: null, details: {}, source_url: null, ...deriveColumns({}) },
      );
      router.push(`/yonetim/ilan?id=${listing.id}`);
    } catch (e) {
      setError(errorMessage(e, "Bu programın aynı derece, öğretim türü ve dilde ilanı zaten var."));
      setPending(false);
    }
  }

  const field = "w-full rounded-xl border-2 border-navy-soft bg-white px-3 py-2 text-sm font-semibold text-navy outline-none focus:border-navy";
  return (
    <form onSubmit={submit} noValidate className="rounded-2xl bg-navy-soft/50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={programId === NEW_PROGRAM ? "" : "sm:col-span-2"}>
          <label htmlFor="new-listing-program" className="mb-1 block text-xs font-extrabold text-navy">
            Program
          </label>
          <select id="new-listing-program" value={programId} onChange={(e) => setProgramId(e.target.value)} className={field}>
            <option value="">Seçilmedi</option>
            {[...programs]
              .sort((a, b) => compareText(a.name, b.name))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.institute ? ` (${p.institute})` : ""}
                </option>
              ))}
            <option value={NEW_PROGRAM}>+ Yeni program</option>
          </select>
        </div>
        {programId === NEW_PROGRAM && (
          <>
            <div>
              <label htmlFor="new-program-name" className="mb-1 block text-xs font-extrabold text-navy">
                Yeni programın adı
              </label>
              <input id="new-program-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className={field} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="new-program-institute" className="mb-1 block text-xs font-extrabold text-navy">
                Enstitü
              </label>
              <input id="new-program-institute" value={institute} onChange={(e) => setInstitute(e.target.value)} maxLength={160} className={field} />
            </div>
          </>
        )}
      </div>
      <div className="mt-3">
        <SchemaForm node={NEW_LISTING} value={raw} onChange={setRaw} errors={errorsByPath(shownIssues(issues, tried))} />
      </div>
      {error && (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
          {pending ? "Bekle..." : "Ekle ve şartlarını yaz"}
        </button>
        <button type="button" disabled={pending} onClick={onCancel} className="btn btn-outline btn-sm">
          Vazgeç
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ ilan tablosu */

type Filter = "hepsi" | "alim-var" | "alim-yok" | "gizli" | "uyarili";

const FILTERS: [Filter, string][] = [
  ["hepsi", "Hepsi"],
  ["alim-var", "Öğrenci alanlar"],
  ["alim-yok", "Alım yok"],
  ["uyarili", "Uyarısı olanlar"],
  ["gizli", "Gizlenenler"],
];

function ListingTable({ listings, programs, onChanged }: { listings: Listing[]; programs: Program[]; onChanged: () => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("hepsi");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const byId = useMemo(() => new Map(programs.map((p) => [p.id, p])), [programs]);
  const rows = useMemo(
    () => sortListings(listings, byId).map((listing) => ({ listing, program: byId.get(listing.program_id), warnings: reviewDetails(listing.degree, listing.accepting, listing.details, "") })),
    [listings, byId],
  );
  const needle = searchable(query.trim());
  const shown = rows.filter(({ listing, program, warnings }) => {
    if (needle && !searchable(`${program?.name ?? ""} ${program?.institute ?? ""}`).includes(needle)) return false;
    if (filter === "alim-var") return listing.accepting;
    if (filter === "alim-yok") return !listing.accepting;
    if (filter === "gizli") return listing.hidden;
    if (filter === "uyarili") return warnings.length > 0;
    return true;
  });

  async function setHidden(listing: Listing, hidden: boolean) {
    setError("");
    setBusyId(listing.id);
    try {
      await updateListing(listing.id, { hidden });
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  if (!listings.length) return <Empty>Bu dönem ilanında henüz program yok. “İlan ekle” ile ekleyebilir ya da dosyadan içe aktarabilirsin.</Empty>;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Program ara"
          aria-label="Program ara"
          className="w-full max-w-xs rounded-xl border-2 border-navy-soft bg-white px-3 py-2 text-sm font-semibold text-navy outline-none focus:border-navy"
        />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Süzgeç">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={`rounded-full px-3 py-1 text-xs font-extrabold transition-colors ${filter === key ? "bg-navy text-white" : "bg-navy-soft text-navy-muted hover:text-navy"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs font-bold text-navy-muted">
          {shown.length} / {rows.length} ilan
        </span>
      </div>
      {error && (
        <div className="mb-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border-2 border-navy-soft">
        <table className="w-full min-w-[60rem] text-left text-sm font-semibold text-navy">
          <thead className="bg-navy-soft text-xs font-extrabold uppercase tracking-wide text-navy-muted">
            <tr>
              <th className="px-3 py-2">Program</th>
              <th className="px-3 py-2">Derece</th>
              <RequirementHeads />
              <th className="px-3 py-2">Durum</th>
              {/* relative: gizli başlık kaydırılan tablonun dışına taşıp sayfayı genişletmesin */}
              <th className="relative px-3 py-2">
                <span className="sr-only">İşlemler</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-soft">
            {shown.map(({ listing, program, warnings }) => (
              <tr key={listing.id} className={listing.hidden ? "bg-navy-soft/40 text-navy-muted" : undefined}>
                <td className="px-3 py-2">
                  <Link href={`/yonetim/ilan?id=${listing.id}`} className="font-extrabold hover:underline">
                    {program?.name ?? "(program bulunamadı)"}
                  </Link>
                  {program?.institute && <span className="block text-xs text-navy-muted">{program.institute}</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {DEGREE_SHORT[listing.degree]}
                  {(listing.mode !== "orgun" || listing.language !== "tr") && (
                    <span className="block text-xs text-navy-muted">
                      {[listing.mode !== "orgun" && MODES[listing.mode], listing.language !== "tr" && TEACHING_LANGUAGES[listing.language]].filter(Boolean).join(", ")}
                    </span>
                  )}
                </td>
                <RequirementCells details={listing.details} accepting={listing.accepting} />
                <td className="px-3 py-2">
                  <span className="flex flex-wrap gap-1">
                    {listing.hidden && <Badge>Gizli</Badge>}
                    {warnings.length > 0 && <Badge tone="warn">{warnings.length} uyarı</Badge>}
                    {!listing.hidden && warnings.length === 0 && <Badge tone="ok">Hazır</Badge>}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <Link href={`/yonetim/ilan?id=${listing.id}`} className="mr-3 text-xs font-extrabold text-navy underline">
                    Düzenle
                  </Link>
                  <button type="button" disabled={busyId === listing.id} onClick={() => setHidden(listing, !listing.hidden)} className="text-xs font-extrabold text-navy-muted underline disabled:opacity-50">
                    {listing.hidden ? "Göster" : "Gizle"}
                  </button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-navy-muted">
                  Bu süzgece uyan ilan yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ sayfa */

function CallView({ id }: { id: string }) {
  const router = useRouter();
  const { data, error, loading, reload } = useLoad(id, async () => {
    const call = await getCall(id);
    if (!call) return null;
    const [university, programs, listings] = await Promise.all([getUniversity(call.university_id), listPrograms(call.university_id), listListings(id)]);
    return { call, university, programs, listings };
  });
  const [mode, setMode] = useState<"view" | "edit" | "add">("view");
  const [actionError, setActionError] = useState("");
  const [saved, setSaved] = useState("");

  if (loading) return <Loading />;
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data || !data.university) {
    return (
      <>
        <PageTitle title="Dönem ilanı bulunamadı" back={{ href: "/yonetim", label: "Yönetim" }} />
        <Empty>Bu dönem ilanı silinmiş olabilir.</Empty>
      </>
    );
  }

  const { call, programs, listings } = data;
  const university: University = data.university;
  const live = call.status === "yayinda";
  const visible = listings.filter((l) => !l.hidden);
  const open = listings.filter((l) => l.accepting).length;
  const warned = visible.filter((l) => reviewDetails(l.degree, l.accepting, l.details, "").length > 0).length;

  async function act(run: () => Promise<unknown>, message: string) {
    setActionError("");
    setSaved("");
    try {
      await run();
      setSaved(message);
      reload();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  return (
    <>
      <PageTitle
        title={callName(call, university)}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={live ? "ok" : "warn"}>{live ? "Yayında" : "Taslak"}</Badge>
            <span>{call.title}</span>
          </span>
        }
        back={{ href: "/yonetim", label: "Yönetim" }}
      >
        {live ? (
          <ConfirmButton
            label="Yayından kaldır"
            question="İlanlar herkese kapanacak. Emin misin?"
            confirmLabel="Evet, kaldır"
            onConfirm={() => act(() => updateCall(call.id, { status: "taslak" }), "Yayından kaldırıldı.")}
          />
        ) : (
          <>
            <ConfirmButton
              label="Yayına al"
              question={`${visible.length} ilan herkese açık olacak${warned ? `; ${warned} ilanda uyarı var` : ""}. Emin misin?`}
              confirmLabel="Evet, yayına al"
              disabled={visible.length === 0}
              onConfirm={() => act(() => updateCall(call.id, { status: "yayinda" }), "Yayına alındı.")}
            />
            <ConfirmButton
              danger
              label="Sil"
              question={`Bu dönem ilanı ve içindeki ${listings.length} ilan silinecek; geri alınamaz.`}
              confirmLabel="Evet, sil"
              onConfirm={async () => {
                setActionError("");
                try {
                  await deleteCall(call.id);
                  router.replace("/yonetim");
                } catch (e) {
                  setActionError(errorMessage(e));
                }
              }}
            />
          </>
        )}
      </PageTitle>

      <div className="space-y-6">
        {actionError && <Notice tone="error">{actionError}</Notice>}
        {saved && <Notice tone="ok">{saved}</Notice>}
        {live && <Notice tone="info">Bu dönem ilanı yayında: yaptığın her değişiklik kaydettiğin anda herkese görünür.</Notice>}

        <Panel
          title="Dönem bilgileri"
          actions={
            mode !== "edit" && (
              <button type="button" onClick={() => setMode("edit")} className="btn btn-outline btn-sm">
                Düzenle
              </button>
            )
          }
        >
          {mode === "edit" ? (
            <CallForm
              initial={call}
              submitLabel="Kaydet"
              onCancel={() => setMode("view")}
              onSubmit={async (row) => {
                await updateCall(call.id, row);
                setMode("view");
                setSaved("Dönem bilgileri kaydedildi.");
                reload();
              }}
            />
          ) : (
            <dl className="grid gap-x-8 gap-y-2 text-sm font-semibold text-navy-muted sm:grid-cols-2">
              <Info label="Başvuru">
                {call.application_start ? formatDateTime(call.application_start) : "?"} - {call.application_end ? formatDateTime(call.application_end) : "?"}
              </Info>
              <Info label="İlanlar">
                {listings.length} ilan, {open} tanesi öğrenci alıyor
                {listings.length - visible.length > 0 && `, ${listings.length - visible.length} gizli`}
              </Info>
              {call.timeline.map((item, i) => (
                <Info key={i} label={item.label}>
                  {[item.date && formatDate(item.date), item.endDate && formatDate(item.endDate)].filter(Boolean).join(" - ")}
                  {item.time ? ` ${item.time}` : ""}
                  {item.note ? ` (${item.note})` : ""}
                </Info>
              ))}
              {call.source_url && (
                <Info label="Kaynak">
                  <a href={call.source_url} target="_blank" rel="noopener noreferrer" className="break-all text-navy underline">
                    {call.source_url}
                  </a>
                  {call.source_checked_on && ` (${formatDate(call.source_checked_on)} tarihinde bakıldı)`}
                </Info>
              )}
              {call.apply_url && (
                <Info label="Başvuru adresi">
                  <a href={call.apply_url} target="_blank" rel="noopener noreferrer" className="break-all text-navy underline">
                    {call.apply_url}
                  </a>
                </Info>
              )}
              {live && call.published_at && <Info label="Yayına alındı">{formatDateTime(call.published_at)}</Info>}
              {call.notes && (
                <div className="sm:col-span-2">
                  <dt className="font-extrabold text-navy">Notlar</dt>
                  <dd className="whitespace-pre-line">{call.notes}</dd>
                </div>
              )}
            </dl>
          )}
        </Panel>

        <Panel
          title="İlanlar"
          actions={
            mode !== "add" && (
              <button type="button" onClick={() => setMode("add")} className="btn btn-outline btn-sm">
                İlan ekle
              </button>
            )
          }
        >
          {mode === "add" && (
            <div className="mb-4">
              <AddListing call={call} programs={programs} onCancel={() => setMode("view")} />
            </div>
          )}
          <ListingTable listings={listings} programs={programs} onChanged={reload} />
        </Panel>
      </div>
    </>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="inline font-extrabold text-navy">{label}: </dt>
      <dd className="inline">{children}</dd>
    </div>
  );
}

function NewCall({ universityId }: { universityId: string }) {
  const router = useRouter();
  const { data: university, error, loading } = useLoad(`uni:${universityId}`, () => getUniversity(universityId));
  if (loading) return <Loading />;
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!university) return <Empty>Üniversite bulunamadı.</Empty>;
  return (
    <>
      <PageTitle title="Yeni dönem ilanı" subtitle={university.name} back={{ href: `/yonetim/universite?id=${university.id}`, label: university.name }} />
      <Panel>
        <CallForm
          submitLabel="Taslak olarak oluştur"
          onSubmit={async (row) => {
            const created = await insertCall(university.id, row);
            router.replace(`/yonetim/donem?id=${created.id}`);
          }}
        />
      </Panel>
    </>
  );
}

export function CallPage() {
  const params = useSearchParams();
  const id = params.get("id");
  const universityId = params.get("universite");
  if (id) return <CallView key={id} id={id} />;
  if (universityId) return <NewCall key={universityId} universityId={universityId} />;
  return (
    <>
      <PageTitle title="Dönem ilanı seçilmedi" back={{ href: "/yonetim", label: "Yönetim" }} />
      <Empty>Yönetim sayfasındaki listeden bir dönem ilanı seç.</Empty>
    </>
  );
}
