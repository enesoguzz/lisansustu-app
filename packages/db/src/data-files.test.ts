/**
 * Depodaki içe aktarma dosyaları (`data/imports/*.json`): sitenin yaptığı denetimden hatasız geçmeli ve
 * gerçek tablolara yazılabilmelidir. Şema ya da tablolar değiştiğinde eskiyen dosya burada ortaya çıkar.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deriveColumns, parseImportText, type ImportPayload } from "@lisansustu/core";
import { NOW } from "./fixtures";
import { createTestDb, type TestDb } from "./harness";

const DIR = fileURLToPath(new URL("../../../data/imports/", import.meta.url));
const FILES = readdirSync(DIR)
  .filter((name) => name.endsWith(".json"))
  .sort();

function read(file: string) {
  return parseImportText(readFileSync(DIR + file, "utf8"), NOW);
}

type Summary = {
  university_new: boolean;
  call_new: boolean;
  programs_new: number;
  listings_new: number;
  listings_updated: number;
  listings_unchanged: number;
  rules: number;
};

describe("depodaki içe aktarma dosyaları", () => {
  let db: TestDb;
  let admin: { id: string };

  const run = (payload: ImportPayload, file: string) =>
    db.as(admin, async (tx) => (await tx.query<{ result: Summary }>("select public.admin_import($1::jsonb, $2) as result", [JSON.stringify(payload), file])).rows[0].result);

  beforeAll(async () => {
    db = await createTestDb();
    admin = await db.createUser({ admin: true });
  });
  afterAll(() => db.close());

  it("klasörde dosya var", () => {
    expect(FILES.length).toBeGreaterThan(0);
  });

  it.each(FILES)("%s denetimden hatasız geçer", (file) => {
    const { payloads, issues } = read(file);
    expect(issues.filter((issue) => issue.level === "error")).toEqual([]);
    expect(payloads.length).toBeGreaterThan(0);
  });

  it.each(FILES)("%s veritabanına yazılır; yeniden yüklenince hiçbir şey değişmez", async (file) => {
    for (const payload of read(file).payloads) {
      const first = await run(payload, file);
      expect(first).toMatchObject({ listings_new: payload.listings.length, listings_updated: 0, listings_unchanged: 0, rules: payload.rules.length });

      const again = await run(payload, file);
      expect(again).toMatchObject({
        university_new: false,
        call_new: false,
        programs_new: 0,
        listings_new: 0,
        listings_updated: 0,
        listings_unchanged: payload.listings.length,
      });

      // Filtre sütunları, kaydedilen şartlardan türetilenle aynı olmalı.
      const stored = await db.rows<{ details: ImportPayload["listings"][number]["details"]; quota_total: number | null; ales_say_min: string | null; yds_min: string | null }>(
        "select l.details, l.quota_total, l.ales_say_min, l.yds_min from public.listings l join public.universities u on u.id = l.university_id where u.slug = $1",
        [payload.university.slug],
      );
      expect(stored).toHaveLength(payload.listings.length);
      for (const row of stored) {
        const derived = deriveColumns(row.details);
        expect(row.quota_total).toBe(derived.quota_total);
        expect(row.ales_say_min === null ? null : Number(row.ales_say_min)).toBe(derived.ales_say_min);
        expect(row.yds_min === null ? null : Number(row.yds_min)).toBe(derived.yds_min);
      }
    }
  });
});
