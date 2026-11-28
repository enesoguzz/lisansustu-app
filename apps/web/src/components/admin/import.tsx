"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  DEGREE_SHORT,
  formatDateTime,
  hasErrors,
  parseImportText,
  planImport,
  termLabel,
  type ExistingState,
  type ImportPayload,
  type ImportPlan,
  type Issue,
  type RowStatus,
} from "@lisansustu/core";
import {
  errorMessage,
  findCall,
  getUniversityBySlug,
  listListings,
  listPrograms,
  listRules,
  runImport,
  type ImportSummary,
} from "@/lib/admin/data";
import { Badge, IssueList, Notice, PageTitle, Panel } from "./ui";
import { RequirementCells, RequirementHeads } from "./listing-cells";

const MAX_BYTES = 5 * 1024 * 1024;

/** Dosyadaki kayıtların veritabanındaki karşılıklarını okur. */
async function existingState(payload: ImportPayload): Promise<ExistingState> {
  const university = await getUniversityBySlug(payload.university.slug);
  if (!university) return { university: null, call: null, programs: [], listings: [], rules: [] };
  const [programs, rules, call] = await Promise.all([
    listPrograms(university.id),
    listRules(university.id),
    payload.call ? findCall(university.id, payload.call) : Promise.resolve(null),
  ]);
  const listings = call ? await listListings(call.id) : [];
  const slugs = new Map(programs.map((p) => [p.id, p.slug]));
  return {
    university,
    call,
    programs,
    rules,
    listings: listings.map((l) => ({
      program_slug: slugs.get(l.program_id) ?? "",
      degree: l.degree,
      mode: l.mode,
      language: l.language,
      accepting: l.accepting,
      application_end: l.application_end,
      details: l.details,
      source_url: l.source_url,
    })),
  };
}

type Preview = { fileName: string | null; issues: Issue[]; documents: { payload: ImportPayload; plan: ImportPlan }[] };
type Outcome = { payload: ImportPayload; summary?: ImportSummary; error?: string };

/** Kayıt sonucunun cümlesi. Yalnızca genel kural taşıyan belgede ilan sayıları yazılmaz. */
function summaryText(summary: ImportSummary): string {
  return [
    summary.call_id && `${summary.listings_new} yeni ilan eklendi, ${summary.listings_updated} ilan güncellendi, ${summary.listings_unchanged} ilan aynı kaldı.`,
    summary.programs_new > 0 && `${summary.programs_new} yeni program açıldı.`,
    summary.rules > 0 && `${summary.rules} genel kural yazıldı.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Genel kuralların taslak durumu yoktur; kaydet düğmesinin yanındaki açıklama bunu saklamamalı. */
const RULES_NOTE = "Genel kurallar kaydedildiği anda geçerli olur.";

const STATUS: Record<RowStatus, { label: string; tone: "info" | "warn" | "neutral" }> = {
  yeni: { label: "Yeni", tone: "info" },
  degisti: { label: "Değişecek", tone: "warn" },
  ayni: { label: "Aynı", tone: "neutral" },
};

function documentTitle(payload: ImportPayload): string {
  return [payload.university.name, payload.call ? termLabel(payload.call.academic_year, payload.call.semester) : "Genel kurallar", payload.call?.institute]
    .filter(Boolean)
    .join(" · ");
}

/** Belgede kaydedilecek bir şey var mı? */
function hasWork(plan: ImportPlan): boolean {
  return (
    plan.university.status !== "ayni" ||
    (plan.call !== null && plan.call.status !== "ayni") ||
    plan.rules.some((r) => r.status !== "ayni") ||
    plan.counts.yeni + plan.counts.degisti > 0
  );
}

export function ImportPage() {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function reset() {
    setText("");
    setFileName(null);
    setPreview(null);
    setOutcomes(null);
    setError("");
    if (fileInput.current) fileInput.current.value = "";
  }

  async function inspect(content: string, name: string | null) {
    setError("");
    setOutcomes(null);
    setPreview(null);
    setBusy(true);
    try {
      const parsed = parseImportText(content);
      const documents = [];
      for (const payload of parsed.payloads) {
        documents.push({ payload, plan: planImport(payload, await existingState(payload)) });
      }
      setPreview({ fileName: name, issues: parsed.issues, documents });
    } catch (e) {
      setError(errorMessage(e, undefined, "Dosya incelenemedi. Lütfen tekrar dene."));
    } finally {
      setBusy(false);
    }
  }

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setPreview(null);
      return setError("Dosya çok büyük (en fazla 5 MB).");
    }
    const content = await file.text();
    setFileName(file.name);
    setText(content);
    await inspect(content, file.name);
  }

  async function save() {
    if (!preview) return;
    setBusy(true);
    setError("");
    const results: Outcome[] = [];
    // Her belge kendi içinde "ya hep ya hiç" kaydedilir; biri kaydedilemezse sonrakilere geçilmez.
    for (const { payload } of preview.documents) {
      try {
        results.push({ payload, summary: await runImport(payload, preview.fileName) });
      } catch (e) {
        results.push({ payload, error: errorMessage(e) });
        break;
      }
    }
    setOutcomes(results);
    setBusy(false);
  }

  const blocked = preview !== null && hasErrors(preview.issues);
  const work = preview?.documents.some((d) => hasWork(d.plan)) ?? false;
  const live = preview?.documents.some((d) => d.plan.call?.published) ?? false;
  const allNew = preview?.documents.every((d) => !d.plan.call || d.plan.call.status === "yeni") ?? false;
  const hasCall = preview?.documents.some((d) => d.plan.call) ?? false;
  const hasRules = preview?.documents.some((d) => d.plan.rules.some((rule) => rule.status !== "ayni")) ?? false;

  return (
    <>
      <PageTitle
        title="Dosyadan içe aktar"
        subtitle="Üniversitenin ilanından hazırlanan dosyayı yükle; kaydetmeden önce neyin ekleneceğini ve değişeceğini görürsün."
        back={{ href: "/yonetim", label: "Yönetim" }}
      />

      {outcomes ? (
        <Panel title="Sonuç">
          <div className="space-y-3">
            {outcomes.map((outcome, i) =>
              outcome.summary ? (
                <Notice key={i} tone="ok" title={`${documentTitle(outcome.payload)} kaydedildi`}>
                  <p>{summaryText(outcome.summary)}</p>
                  {outcome.summary.call_id ? (
                    <Link href={`/yonetim/donem?id=${outcome.summary.call_id}`} className="mt-2 inline-block font-extrabold underline">
                      Dönem ilanını aç
                    </Link>
                  ) : (
                    <Link href={`/yonetim/universite?id=${outcome.summary.university_id}`} className="mt-2 inline-block font-extrabold underline">
                      Üniversiteyi aç
                    </Link>
                  )}
                </Notice>
              ) : (
                <Notice key={i} tone="error" title={`${documentTitle(outcome.payload)} kaydedilemedi`}>
                  <p>{outcome.error} Bu belgeden hiçbir şey kaydedilmedi.</p>
                </Notice>
              ),
            )}
            {preview && outcomes.length < preview.documents.length && (
              <Notice tone="warn">Kalan {preview.documents.length - outcomes.length} belgeye geçilmedi.</Notice>
            )}
            <button type="button" onClick={reset} className="btn btn-outline btn-sm">
              Başka dosya yükle
            </button>
          </div>
        </Panel>
      ) : (
        <div className="space-y-6">
          <Panel title="1. Dosyayı seç">
            <p className="mb-4 text-sm font-semibold text-navy-muted">
              Dosyayı hazırlamak için ilanın linkini ya da PDF&apos;ini sohbette Claude&apos;a ver; sana <span className="font-extrabold text-navy">.json</span> uzantılı bir dosya
              hazırlar. O dosyayı burada seç.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="btn btn-primary btn-sm cursor-pointer">
                Dosya seç
                <input ref={fileInput} type="file" accept=".json,application/json" onChange={pick} className="sr-only" aria-label="İçe aktarma dosyası" />
              </label>
              {fileName && <span className="text-sm font-bold text-navy">{fileName}</span>}
              <button type="button" onClick={() => setPasting((v) => !v)} className="text-sm font-bold text-navy-muted underline">
                {pasting ? "Yapıştırma alanını kapat" : "ya da metni yapıştır"}
              </button>
            </div>
            {pasting && (
              <div className="mt-4">
                <label htmlFor="import-text" className="mb-1 block text-xs font-extrabold text-navy">
                  Dosyanın içeriği
                </label>
                <textarea
                  id="import-text"
                  rows={8}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setFileName(null);
                  }}
                  spellCheck={false}
                  className="w-full rounded-xl border-2 border-navy-soft bg-white px-3 py-2 font-mono text-xs text-navy outline-none focus:border-navy"
                />
                <button type="button" disabled={busy || text.trim() === ""} onClick={() => inspect(text, null)} className="btn btn-primary btn-sm mt-2">
                  İncele
                </button>
              </div>
            )}
            {busy && !preview && <p className="mt-4 text-sm font-bold text-navy-muted">Dosya inceleniyor...</p>}
            {error && (
              <div className="mt-4">
                <Notice tone="error">{error}</Notice>
              </div>
            )}
          </Panel>

          {preview && (
            <Panel title="2. Önizleme">
              <div className="space-y-4">
                <IssueList issues={preview.issues} level="error" title="Dosya kaydedilemez: düzeltilmesi gerekenler" limit={30} />
                <IssueList issues={preview.issues} level="warning" title="Göz atılması gerekenler" />
                {blocked && <p className="text-sm font-semibold text-navy-muted">Hatalar düzeltilip dosya yeniden yüklenince önizleme burada görünür.</p>}

                {preview.documents.map(({ payload, plan }, index) => (
                  <DocumentPreview key={index} payload={payload} plan={plan} />
                ))}

                {!blocked && preview.documents.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3 border-t-2 border-navy-soft pt-4">
                    <button type="button" disabled={busy || !work} onClick={save} className="btn btn-primary">
                      {busy
                        ? "Kaydediliyor..."
                        : !work
                          ? "Değişiklik yok"
                          : live
                            ? "Kaydet ve yayındakini güncelle"
                            : !hasCall
                              ? "Kaydet"
                              : allNew
                                ? "Taslak olarak kaydet"
                                : "Değişiklikleri kaydet"}
                    </button>
                    <button type="button" disabled={busy} onClick={reset} className="btn btn-outline btn-sm">
                      Vazgeç
                    </button>
                    <p className="w-full text-sm font-semibold text-navy-muted sm:w-auto sm:min-w-0 sm:flex-1">
                      {!work
                        ? "Bu dosyadaki her şey zaten kayıtlı."
                        : live
                          ? "Bu dönem ilanı yayında: kaydettiğin anda değişiklikler herkese görünür."
                          : !hasCall
                            ? RULES_NOTE
                            : `Dönem ilanı taslak olarak durur; sen yayına alana kadar kimse göremez.${hasRules ? ` ${RULES_NOTE}` : ""}`}
                    </p>
                  </div>
                )}
              </div>
            </Panel>
          )}
        </div>
      )}
    </>
  );
}

function DocumentPreview({ payload, plan }: { payload: ImportPayload; plan: ImportPlan }) {
  const open = payload.listings.filter((l) => l.accepting).length;
  const ruleCounts = plan.rules.reduce<Record<RowStatus, number>>((acc, r) => ({ ...acc, [r.status]: acc[r.status] + 1 }), { yeni: 0, degisti: 0, ayni: 0 });
  return (
    <div className="rounded-2xl border-2 border-navy-soft p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-black text-navy">{documentTitle(payload)}</h3>
        {plan.university.status === "yeni" && <Badge tone="info">Yeni üniversite</Badge>}
        {plan.call && <Badge tone={plan.call.published ? "ok" : plan.call.status === "yeni" ? "info" : "warn"}>{plan.call.published ? "Yayında" : plan.call.status === "yeni" ? "Yeni dönem ilanı" : "Kayıtlı taslak"}</Badge>}
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm font-semibold text-navy-muted sm:grid-cols-2">
        {payload.call && (
          <div>
            <dt className="inline font-extrabold text-navy">Başvuru: </dt>
            <dd className="inline">
              {payload.call.application_start ? formatDateTime(payload.call.application_start) : "?"} - {payload.call.application_end ? formatDateTime(payload.call.application_end) : "?"}
            </dd>
          </div>
        )}
        {payload.listings.length > 0 && (
          <div>
            <dt className="inline font-extrabold text-navy">İlanlar: </dt>
            <dd className="inline">
              {payload.listings.length} ilan, {open} tanesi öğrenci alıyor
            </dd>
          </div>
        )}
        {payload.listings.length > 0 && (
          <div>
            <dt className="inline font-extrabold text-navy">Bu kayıtla: </dt>
            <dd className="inline">
              {plan.counts.yeni} yeni, {plan.counts.degisti} değişecek, {plan.counts.ayni} aynı
            </dd>
          </div>
        )}
        {plan.rules.length > 0 && (
          <div>
            <dt className="inline font-extrabold text-navy">Genel kurallar: </dt>
            <dd className="inline">
              {ruleCounts.yeni} yeni, {ruleCounts.degisti} değişecek, {ruleCounts.ayni} aynı
            </dd>
          </div>
        )}
      </dl>

      {plan.university.status === "degisti" && (
        <p className="mt-2 text-sm font-semibold text-amber-900">Üniversite bilgisinde değişecekler: {plan.university.changes.join(", ")}.</p>
      )}
      {plan.call?.status === "degisti" && <p className="mt-2 text-sm font-semibold text-amber-900">Dönem ilanında değişecekler: {plan.call.changes.join(", ")}.</p>}
      {plan.untouched > 0 && (
        <p className="mt-2 text-sm font-semibold text-navy-muted">
          Kayıtlı {plan.untouched} ilan bu dosyada yok; onlara dokunulmaz. Kaldırılması gerekiyorsa dönem ilanının sayfasından silebilir ya da gizleyebilirsin.
        </p>
      )}

      {payload.listings.length > 0 && (
        <div className="mt-4 max-h-[28rem] overflow-auto rounded-xl border-2 border-navy-soft">
          <table className="w-full min-w-[52rem] text-left text-sm font-semibold text-navy">
            <thead className="sticky top-0 bg-navy-soft text-xs font-extrabold uppercase tracking-wide text-navy-muted">
              <tr>
                <th className="px-3 py-2">Program</th>
                <th className="px-3 py-2">Derece</th>
                <RequirementHeads />
                <th className="px-3 py-2">Bu kayıtla</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-soft">
              {payload.listings.map((listing, i) => {
                const row = plan.listings[i];
                return (
                  <tr key={i}>
                    <td className="px-3 py-2">
                      <span className="font-extrabold">{listing.program.name}</span>
                      {listing.program.institute && <span className="block text-xs text-navy-muted">{listing.program.institute}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{DEGREE_SHORT[listing.degree]}</td>
                    <RequirementCells details={listing.details} accepting={listing.accepting} />
                    <td className="px-3 py-2">
                      <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>
                      {row.changes.length > 0 && <span className="mt-0.5 block text-xs text-navy-muted">{row.changes.join(", ")}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
