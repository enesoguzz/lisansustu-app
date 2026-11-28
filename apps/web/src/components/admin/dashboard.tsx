"use client";

import Link from "next/link";
import { formatDate, formatDateTime } from "@lisansustu/core";
import { listCallOverviews, listImports } from "@/lib/admin/data";
import { callName } from "@/lib/admin/format";
import { useLoad } from "@/lib/admin/use-load";
import { Badge, Empty, Loading, Notice, PageTitle, Panel } from "./ui";

export function Dashboard() {
  const { data, error, loading } = useLoad("dashboard", async () => {
    const [calls, imports] = await Promise.all([listCallOverviews(), listImports(5)]);
    return { calls, imports };
  });

  return (
    <>
      <PageTitle title="Yönetim" subtitle="Dönem ilanları, programlar ve şartları buradan yönetilir.">
        <Link href="/yonetim/ice-aktar" className="btn btn-primary btn-sm">
          Dosyadan içe aktar
        </Link>
        <Link href="/yonetim/universiteler" className="btn btn-outline btn-sm">
          Üniversiteler
        </Link>
      </PageTitle>

      {error && <Notice tone="error">{error}</Notice>}
      {loading && <Loading />}
      {data && (
        <div className="space-y-6">
          <Panel title="Dönem ilanları">
            {data.calls.length === 0 ? (
              <Empty>
                Henüz ilan yok. Hazırlanan dosyayı{" "}
                <Link href="/yonetim/ice-aktar" className="font-extrabold text-navy underline">
                  içe aktararak
                </Link>{" "}
                başlayabilirsin.
              </Empty>
            ) : (
              <ul className="divide-y-2 divide-navy-soft">
                {data.calls.map((call) => (
                  <li key={call.id}>
                    <Link href={`/yonetim/donem?id=${call.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-2 py-3 hover:bg-navy-soft/60">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-extrabold text-navy">
                          {callName(call, { name: call.university_name, short_name: call.university_short_name })}
                        </span>
                        <span className="block truncate text-sm font-semibold text-navy-muted">
                          {call.listing_count} ilan, {call.open_count} tanesi öğrenci alıyor
                          {call.application_end ? ` · Son başvuru ${formatDateTime(call.application_end)}` : ""}
                        </span>
                      </span>
                      <Badge tone={call.status === "yayinda" ? "ok" : "warn"}>{call.status === "yayinda" ? "Yayında" : "Taslak"}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {data.imports.length > 0 && (
            <Panel title="Son içe aktarmalar">
              <ul className="space-y-1 text-sm font-semibold text-navy-muted">
                {data.imports.map((log) => (
                  <li key={log.id} className="flex flex-wrap gap-x-3">
                    <span className="font-extrabold text-navy">{formatDate(log.created_at.slice(0, 10))}</span>
                    <span>{log.file_name ?? "Yapıştırılan metin"}</span>
                    <span>
                      {log.summary.listings_new ?? 0} yeni, {log.summary.listings_updated ?? 0} değişen, {log.summary.listings_unchanged ?? 0} aynı ilan
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}
    </>
  );
}
