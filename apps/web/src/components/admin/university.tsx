"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  DEGREES,
  DETAILS_SCHEMA,
  FIELDS,
  PROGRAM_SCHEMA,
  UNIVERSITY_KINDS,
  UNIVERSITY_SCHEMA,
  alesSummary,
  check,
  entries,
  gpaSummary,
  hasErrors,
  programRow,
  slugify,
  termLabel,
  universityRow,
  type Degree,
  type ListingDetails,
  type ObjectNode,
  type RawProgram,
  type RawUniversity,
} from "@lisansustu/core";
import {
  deleteProgram,
  deleteRule,
  deleteUniversity,
  UserError,
  errorMessage,
  getUniversity,
  insertProgram,
  insertRule,
  insertUniversity,
  isInUse,
  listCalls,
  listPrograms,
  listRules,
  listUniversities,
  updateProgram,
  updateRule,
  updateUniversity,
  type Program,
  type Rule,
  type University,
} from "@/lib/admin/data";
import { useLoad } from "@/lib/admin/use-load";
import { DetailsEditor } from "./details-editor";
import { FIX_MARKED, SchemaForm, errorsByPath, shownIssues } from "./schema-form";
import { Badge, ConfirmButton, Empty, Loading, Notice, PageTitle, Panel } from "./ui";

/** Kayıt satırından form değeri: boş alanlar çıkarılır. */
function toRaw(node: ObjectNode, row: object): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const key of Object.keys(node.fields)) {
    const value = (row as Record<string, unknown>)[key];
    if (value !== null && value !== undefined && value !== "") raw[key] = value;
  }
  return raw;
}

/** Şemadan çizilen küçük form: denetler, temizlenmiş değeri `onSubmit`e verir. */
function RecordForm<T>({
  node,
  initial,
  locked,
  submitLabel,
  duplicate,
  onSubmit,
  onCancel,
  prepare,
}: {
  node: ObjectNode;
  initial: Record<string, unknown>;
  locked?: string[];
  submitLabel: string;
  duplicate: string;
  onSubmit: (value: T) => Promise<void>;
  onCancel?: () => void;
  /** Denetimden önce ham değeri tamamlar (ör. boş bırakılan adres adını üretir). */
  prepare?: (raw: Record<string, unknown>) => Record<string, unknown>;
}) {
  const [raw, setRaw] = useState<unknown>(initial);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const input = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const { value, issues } = check<T>(node, prepare ? prepare(input) : input);
  const invalid = !value || hasErrors(issues);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setError("");
    if (!value || invalid) return;
    setPending(true);
    try {
      await onSubmit(value);
    } catch (e) {
      setError(errorMessage(e, duplicate));
    } finally {
      setPending(false);
    }
  }

  const message = error || (tried && invalid ? FIX_MARKED : "");
  return (
    <form onSubmit={submit} noValidate>
      <SchemaForm node={node} value={raw} onChange={setRaw} errors={errorsByPath(shownIssues(issues, tried))} locked={locked} />
      {message && (
        <div className="mt-3">
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

/** Elle eklerken adres adı zorunlu değildir: boş bırakılırsa addan üretilir. */
const NEW_UNIVERSITY: ObjectNode = {
  ...UNIVERSITY_SCHEMA,
  fields: {
    ...UNIVERSITY_SCHEMA.fields,
    slug: { kind: "slug", label: "Adres adı", hint: "Sayfa adresinde kullanılır (ör. bogazici). Boş bırakırsan addan üretilir; sonradan değiştirilmez." },
  },
};

/** Adres adı boş bırakıldıysa addan üretir. */
const withSlug = (raw: Record<string, unknown>) =>
  typeof raw.slug === "string" && raw.slug.trim() !== "" ? raw : { ...raw, slug: typeof raw.name === "string" ? slugify(raw.name) : undefined };

/* ------------------------------------------------------------------ üniversite listesi */

export function UniversitiesPage() {
  const router = useRouter();
  const { data, error, loading } = useLoad("universities", listUniversities);
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageTitle title="Üniversiteler" subtitle="İçe aktarılan dosyalar üniversiteyi kendiliğinden ekler; buradan elle de ekleyebilirsin." back={{ href: "/yonetim", label: "Yönetim" }}>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="btn btn-primary btn-sm">
            Üniversite ekle
          </button>
        )}
      </PageTitle>
      <div className="space-y-6">
        {adding && (
          <Panel title="Yeni üniversite">
            <RecordForm<RawUniversity>
              node={NEW_UNIVERSITY}
              initial={{}}
              submitLabel="Ekle"
              duplicate="Bu adres adıyla bir üniversite zaten var."
              prepare={withSlug}
              onCancel={() => setAdding(false)}
              onSubmit={async (value) => {
                if (!value.slug) throw new UserError("Addan adres adı üretilemedi; adres adını kendin yaz.");
                const created = await insertUniversity(universityRow(value));
                router.push(`/yonetim/universite?id=${created.id}`);
              }}
            />
          </Panel>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        {loading && <Loading />}
        {data && (
          <Panel>
            {data.length === 0 ? (
              <Empty>Henüz üniversite yok.</Empty>
            ) : (
              <ul className="divide-y-2 divide-navy-soft">
                {data.map((university) => (
                  <li key={university.id}>
                    <Link href={`/yonetim/universite?id=${university.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-2 py-3 hover:bg-navy-soft/60">
                      <span className="min-w-0 flex-1 truncate font-extrabold text-navy">{university.name}</span>
                      <span className="text-sm font-semibold text-navy-muted">{[university.city, university.kind && UNIVERSITY_KINDS[university.kind]].filter(Boolean).join(" · ")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ programlar */

function Programs({ university, programs, onChanged }: { university: University; programs: Program[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");

  return (
    <Panel
      title={`Programlar (${programs.length})`}
      actions={
        editing !== "new" && (
          <button type="button" onClick={() => setEditing("new")} className="btn btn-outline btn-sm">
            Program ekle
          </button>
        )
      }
    >
      {error && (
        <div className="mb-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {editing === "new" && (
        <div className="mb-4 rounded-2xl bg-navy-soft/50 p-4">
          <RecordForm<RawProgram>
            node={PROGRAM_SCHEMA}
            initial={{}}
            submitLabel="Ekle"
            duplicate="Bu adres adıyla bir program zaten var."
            onCancel={() => setEditing(null)}
            onSubmit={async (value) => {
              const row = programRow(value);
              if (!row.slug) throw new UserError("Program adından adres adı üretilemedi; adında harf ya da rakam olmalı.");
              await insertProgram(university.id, row);
              setEditing(null);
              onChanged();
            }}
          />
        </div>
      )}
      {programs.length === 0 ? (
        <Empty>Henüz program yok.</Empty>
      ) : (
        <ul className="divide-y-2 divide-navy-soft">
          {programs.map((program) => (
            <li key={program.id} className="py-3">
              {editing === program.id ? (
                <RecordForm<RawProgram>
                  node={PROGRAM_SCHEMA}
                  initial={toRaw(PROGRAM_SCHEMA, program)}
                  locked={["slug"]}
                  submitLabel="Kaydet"
                  duplicate="Bu adres adıyla bir program zaten var."
                  onCancel={() => setEditing(null)}
                  onSubmit={async (value) => {
                    const row = programRow(value);
                    await updateProgram(program.id, { name: row.name, institute: row.institute, field: row.field, url: row.url });
                    setEditing(null);
                    onChanged();
                  }}
                />
              ) : (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-extrabold text-navy">{program.name}</span>
                    <span className="block truncate text-sm font-semibold text-navy-muted">{[program.institute, program.field && FIELDS[program.field]].filter(Boolean).join(" · ") || "Enstitü ve alan yazılmamış"}</span>
                  </span>
                  <button type="button" onClick={() => setEditing(program.id)} className="text-xs font-extrabold text-navy underline">
                    Düzenle
                  </button>
                  <ConfirmButton
                    danger
                    quiet
                    label="Sil"
                    question="Program silinecek."
                    confirmLabel="Evet, sil"
                    onConfirm={async () => {
                      setError("");
                      try {
                        await deleteProgram(program.id);
                        onChanged();
                      } catch (e) {
                        setError(isInUse(e) ? `“${program.name}” silinemedi: bu programın ilanları var. Önce ilanlarını sil.` : errorMessage(e));
                      }
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ genel kurallar */

const RULE_META: ObjectNode = {
  kind: "object",
  label: "Genel kural",
  fields: {
    degree: { kind: "enum", label: "Derece", options: entries(DEGREES), required: true },
    institute: { kind: "text", label: "Enstitü", max: 160, hint: "Kural üniversitenin tamamı için geçerliyse boş bırak." },
    source_url: { kind: "url", label: "Kaynak (yönetmelik ya da yönergenin adresi)" },
    notes: { kind: "text", label: "Notlar", multiline: true, max: 4000 },
  },
};
type RuleMeta = { degree: Degree; institute?: string; source_url?: string; notes?: string };

function RuleForm({ initial, onSubmit, onCancel }: { initial?: Rule; onSubmit: (row: Pick<Rule, "institute" | "degree" | "details" | "notes" | "source_url">) => Promise<void>; onCancel: () => void }) {
  const [meta, setMeta] = useState<unknown>(() => (initial ? toRaw(RULE_META, initial) : {}));
  const [details, setDetails] = useState<unknown>(initial?.details ?? {});
  const [tried, setTried] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const checkedMeta = check<RuleMeta>(RULE_META, meta);
  const checkedDetails = check<ListingDetails>(DETAILS_SCHEMA, details);
  const issues = [...checkedMeta.issues, ...checkedDetails.issues];
  const invalid = !checkedMeta.value || hasErrors(issues);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setError("");
    if (!checkedMeta.value || invalid) return;
    setPending(true);
    try {
      await onSubmit({
        degree: checkedMeta.value.degree,
        institute: checkedMeta.value.institute ?? "",
        source_url: checkedMeta.value.source_url ?? null,
        notes: checkedMeta.value.notes ?? null,
        details: checkedDetails.value ?? {},
      });
    } catch (e) {
      setError(errorMessage(e, "Bu enstitü ve derece için zaten bir kural var."));
    } finally {
      setPending(false);
    }
  }

  const errors = errorsByPath(shownIssues(issues, tried));
  const message = error || (tried && invalid ? FIX_MARKED : "");
  return (
    <form onSubmit={submit} noValidate className="rounded-2xl bg-navy-soft/50 p-4">
      <SchemaForm node={RULE_META} value={meta} onChange={setMeta} errors={errors} />
      <div className="mt-4 rounded-2xl bg-white p-3">
        <DetailsEditor value={details} onChange={setDetails} errors={errors} />
      </div>
      {message && (
        <div className="mt-3">
          <Notice tone="error">{message}</Notice>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
          {pending ? "Bekle..." : "Kuralı kaydet"}
        </button>
        <button type="button" disabled={pending} onClick={onCancel} className="btn btn-outline btn-sm">
          Vazgeç
        </button>
      </div>
    </form>
  );
}

function Rules({ university, rules, onChanged }: { university: University; rules: Rule[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");

  return (
    <Panel
      title="Genel kurallar"
      actions={
        editing !== "new" && (
          <button type="button" onClick={() => setEditing("new")} className="btn btn-outline btn-sm">
            Kural ekle
          </button>
        )
      }
    >
      <p className="mb-4 text-sm font-semibold text-navy-muted">Üniversitenin yönetmeliğindeki her program için geçerli alt sınırlar. İlanında şart yazmayan programlar için bunlar esas alınır.</p>
      {error && (
        <div className="mb-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {editing === "new" && (
        <div className="mb-4">
          <RuleForm
            onCancel={() => setEditing(null)}
            onSubmit={async (row) => {
              await insertRule(university.id, row);
              setEditing(null);
              onChanged();
            }}
          />
        </div>
      )}
      {rules.length === 0 ? (
        <Empty>Henüz genel kural yazılmamış.</Empty>
      ) : (
        <ul className="space-y-3">
          {rules.map((rule) => (
            <li key={rule.id}>
              {editing === rule.id ? (
                <RuleForm
                  initial={rule}
                  onCancel={() => setEditing(null)}
                  onSubmit={async (row) => {
                    await updateRule(rule.id, row);
                    setEditing(null);
                    onChanged();
                  }}
                />
              ) : (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border-2 border-navy-soft px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-extrabold text-navy">
                      {DEGREES[rule.degree]}
                      {rule.institute && <span className="font-semibold text-navy-muted"> · {rule.institute}</span>}
                    </span>
                    <span className="block text-sm font-semibold text-navy-muted">
                      {[alesSummary(rule.details.ales) && `ALES: ${alesSummary(rule.details.ales)}`, gpaSummary(rule.details.gpa) && `Not ortalaması: ${gpaSummary(rule.details.gpa)}`]
                        .filter(Boolean)
                        .join(" · ") || "Şart yazılmamış"}
                    </span>
                  </span>
                  <button type="button" onClick={() => setEditing(rule.id)} className="text-xs font-extrabold text-navy underline">
                    Düzenle
                  </button>
                  <ConfirmButton
                    danger
                    quiet
                    label="Sil"
                    question="Kural silinecek."
                    confirmLabel="Evet, sil"
                    onConfirm={async () => {
                      setError("");
                      try {
                        await deleteRule(rule.id);
                        onChanged();
                      } catch (e) {
                        setError(errorMessage(e));
                      }
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ üniversite sayfası */

function UniversityView({ id }: { id: string }) {
  const router = useRouter();
  const { data, error, loading, reload } = useLoad(id, async () => {
    const university = await getUniversity(id);
    if (!university) return null;
    const [programs, rules, calls] = await Promise.all([listPrograms(id), listRules(id), listCalls(id)]);
    return { university, programs, rules, calls };
  });
  const [editing, setEditing] = useState(false);
  const [actionError, setActionError] = useState("");

  if (loading) return <Loading />;
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) {
    return (
      <>
        <PageTitle title="Üniversite bulunamadı" back={{ href: "/yonetim/universiteler", label: "Üniversiteler" }} />
        <Empty>Bu üniversite silinmiş olabilir.</Empty>
      </>
    );
  }
  const { university, programs, rules, calls } = data;

  return (
    <>
      <PageTitle
        title={university.name}
        subtitle={[university.city, university.kind && UNIVERSITY_KINDS[university.kind]].filter(Boolean).join(" · ") || undefined}
        back={{ href: "/yonetim/universiteler", label: "Üniversiteler" }}
      >
        <ConfirmButton
          danger
          label="Üniversiteyi sil"
          question="Üniversite silinecek; geri alınamaz."
          confirmLabel="Evet, sil"
          onConfirm={async () => {
            setActionError("");
            try {
              await deleteUniversity(university.id);
              router.replace("/yonetim/universiteler");
            } catch (e) {
              setActionError(isInUse(e) ? "Silinemedi: bu üniversitenin programları ya da dönem ilanları var. Önce onları sil." : errorMessage(e));
            }
          }}
        />
      </PageTitle>

      <div className="space-y-6">
        {actionError && <Notice tone="error">{actionError}</Notice>}

        <Panel
          title="Bilgiler"
          actions={
            !editing && (
              <button type="button" onClick={() => setEditing(true)} className="btn btn-outline btn-sm">
                Düzenle
              </button>
            )
          }
        >
          {editing ? (
            <RecordForm<RawUniversity>
              node={UNIVERSITY_SCHEMA}
              initial={toRaw(UNIVERSITY_SCHEMA, university)}
              locked={["slug"]}
              submitLabel="Kaydet"
              duplicate="Bu adres adıyla bir üniversite zaten var."
              onCancel={() => setEditing(false)}
              onSubmit={async (value) => {
                const row = universityRow(value);
                await updateUniversity(university.id, { name: row.name, short_name: row.short_name, city: row.city, kind: row.kind, website: row.website });
                setEditing(false);
                reload();
              }}
            />
          ) : (
            <dl className="grid gap-x-8 gap-y-2 text-sm font-semibold text-navy-muted sm:grid-cols-2">
              <div>
                <dt className="inline font-extrabold text-navy">Adres adı: </dt>
                <dd className="inline">{university.slug}</dd>
              </div>
              {university.short_name && (
                <div>
                  <dt className="inline font-extrabold text-navy">Kısa adı: </dt>
                  <dd className="inline">{university.short_name}</dd>
                </div>
              )}
              {university.website && (
                <div>
                  <dt className="inline font-extrabold text-navy">Web sitesi: </dt>
                  <dd className="inline">
                    <a href={university.website} target="_blank" rel="noopener noreferrer" className="break-all text-navy underline">
                      {university.website}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          )}
        </Panel>

        <Panel
          title="Dönem ilanları"
          actions={
            <Link href={`/yonetim/donem?universite=${university.id}`} className="btn btn-outline btn-sm">
              Yeni dönem ilanı
            </Link>
          }
        >
          {calls.length === 0 ? (
            <Empty>Bu üniversitenin henüz dönem ilanı yok.</Empty>
          ) : (
            <ul className="divide-y-2 divide-navy-soft">
              {calls.map((call) => (
                <li key={call.id}>
                  <Link href={`/yonetim/donem?id=${call.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-2 py-3 hover:bg-navy-soft/60">
                    <span className="min-w-0 flex-1 truncate font-extrabold text-navy">{[termLabel(call.academic_year, call.semester), call.institute].filter(Boolean).join(" · ")}</span>
                    <Badge tone={call.status === "yayinda" ? "ok" : "warn"}>{call.status === "yayinda" ? "Yayında" : "Taslak"}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Rules university={university} rules={rules} onChanged={reload} />
        <Programs university={university} programs={programs} onChanged={reload} />
      </div>
    </>
  );
}

export function UniversityPage() {
  const id = useSearchParams().get("id");
  if (id) return <UniversityView key={id} id={id} />;
  return (
    <>
      <PageTitle title="Üniversite seçilmedi" back={{ href: "/yonetim/universiteler", label: "Üniversiteler" }} />
      <Empty>Listeden bir üniversite seç.</Empty>
    </>
  );
}
