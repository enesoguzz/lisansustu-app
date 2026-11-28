import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ImportPayload } from "@lisansustu/core";
import { sampleDoc, toPayload } from "./fixtures";
import { createTestDb, migrationFiles, type Actor, type TestDb } from "./harness";

const U1 = "00000000-0000-0000-0000-0000000000a1";
const U2 = "00000000-0000-0000-0000-0000000000a2";
const P1 = "00000000-0000-0000-0000-0000000000b1";
const P2 = "00000000-0000-0000-0000-0000000000b2";
const P_OTHER = "00000000-0000-0000-0000-0000000000b3";
const C_LIVE = "00000000-0000-0000-0000-0000000000c1";
const C_DRAFT = "00000000-0000-0000-0000-0000000000c2";
const L_LIVE = "00000000-0000-0000-0000-0000000000d1";
const L_HIDDEN = "00000000-0000-0000-0000-0000000000d2";
const L_DRAFT = "00000000-0000-0000-0000-0000000000d3";

/** Bir yayında, bir taslak dönem ilanı; yayındakinin bir ilanı gizli. */
const SEED = `
  insert into public.universities (id, slug, name) values
    ('${U1}', 'ornek', 'Örnek Üniversitesi'),
    ('${U2}', 'baska', 'Başka Üniversitesi');
  insert into public.programs (id, university_id, slug, name) values
    ('${P1}', '${U1}', 'bilgisayar-muhendisligi', 'Bilgisayar Mühendisliği'),
    ('${P2}', '${U1}', 'fizik', 'Fizik'),
    ('${P_OTHER}', '${U2}', 'tarih', 'Tarih');
  insert into public.calls (id, university_id, academic_year, semester, title, status) values
    ('${C_LIVE}', '${U1}', 2026, 'bahar', 'Yayındaki ilan', 'yayinda'),
    ('${C_DRAFT}', '${U1}', 2026, 'guz', 'Taslak ilan', 'taslak');
  insert into public.listings (id, university_id, call_id, program_id, degree, hidden, accepting) values
    ('${L_LIVE}', '${U1}', '${C_LIVE}', '${P1}', 'yl-tezli', false, true),
    ('${L_HIDDEN}', '${U1}', '${C_LIVE}', '${P2}', 'doktora', true, false),
    ('${L_DRAFT}', '${U1}', '${C_DRAFT}', '${P1}', 'yl-tezli', false, true);
  insert into public.university_rules (university_id, degree, details) values
    ('${U1}', 'doktora', '{"ales":{"required":true,"options":[{"type":"SAY","min":55}]}}');
`;

describe("kurulum", () => {
  it("bütün migration dosyaları boş bir veritabanında sırayla çalışır", async () => {
    const db = await createTestDb();
    expect(migrationFiles().length).toBeGreaterThanOrEqual(4);
    const tables = await db.rows<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public' order by 1");
    expect(tables.map((t) => t.tablename)).toEqual(["calls", "imports", "listings", "profiles", "programs", "universities", "university_rules"]);
    await db.close();
  });

  it("her tabloda satır güvenliği açıktır", async () => {
    const db = await createTestDb();
    const open = await db.rows("select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity");
    expect(open).toEqual([]);
    await db.close();
  });
});

describe("erişim kuralları", () => {
  let db: TestDb;
  let admin: { id: string };
  let member: { id: string };

  beforeAll(async () => {
    db = await createTestDb();
    admin = await db.createUser({ admin: true });
    member = await db.createUser();
    await db.pg.exec(SEED);
  });
  afterAll(() => db.close());

  const count = (actor: Actor, table: string) =>
    db.as(actor, async (tx) => Number((await tx.query<{ n: number }>(`select count(*)::int as n from public.${table}`)).rows[0].n));
  const affected = (actor: Actor, sql: string) => db.as(actor, async (tx) => (await tx.query(sql)).affectedRows ?? 0);

  describe.each([["ziyaretçi", "anon" as Actor], ["üye", null]])("%s", (_label, who) => {
    const actor = (): Actor => who ?? member;

    it("üniversiteleri, programları ve genel kuralları görür", async () => {
      expect(await count(actor(), "universities")).toBe(2);
      expect(await count(actor(), "programs")).toBe(3);
      expect(await count(actor(), "university_rules")).toBe(1);
    });

    it("yalnızca yayındaki dönem ilanını ve onun gizlenmemiş ilanını görür", async () => {
      const calls = await db.as(actor(), async (tx) => (await tx.query<{ id: string }>("select id from public.calls")).rows);
      expect(calls.map((c) => c.id)).toEqual([C_LIVE]);
      const listings = await db.as(actor(), async (tx) => (await tx.query<{ id: string }>("select id from public.listings")).rows);
      expect(listings.map((l) => l.id)).toEqual([L_LIVE]);
    });

    it("özet görünümde de yalnızca görebildiğini sayar", async () => {
      const rows = await db.as(actor(), async (tx) => (await tx.query("select id, listing_count, open_count, university_name from public.call_overview")).rows);
      expect(rows).toEqual([{ id: C_LIVE, listing_count: 1, open_count: 1, university_name: "Örnek Üniversitesi" }]);
    });
  });

  describe("ziyaretçi", () => {
    it("hiçbir şey yazamaz", async () => {
      await expect(affected("anon", "insert into public.universities (slug, name) values ('x', 'Xx')")).rejects.toThrow(/permission denied/);
      await expect(affected("anon", `update public.calls set title = 'Değişti' where id = '${C_LIVE}'`)).rejects.toThrow(/permission denied/);
      await expect(affected("anon", `delete from public.listings where id = '${L_LIVE}'`)).rejects.toThrow(/permission denied/);
    });

    it("içe aktarma kayıtlarına ve profillere erişemez", async () => {
      await expect(count("anon", "imports")).rejects.toThrow(/permission denied/);
      await expect(count("anon", "profiles")).rejects.toThrow(/permission denied/);
    });

    it("yönetici fonksiyonlarını çağıramaz", async () => {
      await expect(affected("anon", "select public.is_admin()")).rejects.toThrow(/permission denied for function is_admin/);
      await expect(affected("anon", "select public.admin_import('{}'::jsonb)")).rejects.toThrow(/permission denied for function admin_import/);
    });
  });

  describe("üye", () => {
    it("yönetici sayılmaz", async () => {
      const rows = await db.as(member, async (tx) => (await tx.query<{ ok: boolean }>("select public.is_admin() as ok")).rows);
      expect(rows[0].ok).toBe(false);
    });

    it("kayıt ekleyemez", async () => {
      await expect(affected(member, "insert into public.universities (slug, name) values ('x', 'Xx')")).rejects.toThrow(/row-level security/);
      await expect(
        affected(member, `insert into public.listings (university_id, call_id, program_id, degree) values ('${U1}', '${C_LIVE}', '${P2}', 'yl-tezli')`),
      ).rejects.toThrow(/row-level security/);
      await expect(affected(member, `insert into public.imports (payload) values ('{}'::jsonb)`)).rejects.toThrow(/row-level security/);
    });

    it("kayıt değiştiremez ve silemez; taslağı yayına alamaz", async () => {
      expect(await affected(member, `update public.calls set status = 'yayinda' where id = '${C_DRAFT}'`)).toBe(0);
      expect(await affected(member, `update public.calls set title = 'Değişti' where id = '${C_LIVE}'`)).toBe(0);
      expect(await affected(member, `update public.listings set hidden = false where id = '${L_HIDDEN}'`)).toBe(0);
      expect(await affected(member, "delete from public.listings")).toBe(0);
      expect(await affected(member, "delete from public.universities")).toBe(0);
      const calls = await db.rows<{ title: string; status: string }>("select title, status from public.calls order by title");
      expect(calls).toEqual([
        { title: "Taslak ilan", status: "taslak" },
        { title: "Yayındaki ilan", status: "yayinda" },
      ]);
      expect((await db.rows("select 1 from public.listings")).length).toBe(3);
    });

    it("kendini yönetici yapamaz", async () => {
      await expect(affected(member, `update public.profiles set role = 'admin' where id = '${member.id}'`)).rejects.toThrow(/permission denied/);
      expect(await db.rows("select role from public.profiles where id = $1", [member.id])).toEqual([{ role: "user" }]);
    });

    it("içe aktarma yapamaz, kayıtlarını göremez", async () => {
      const payload = JSON.stringify(toPayload(sampleDoc()));
      await expect(db.as(member, (tx) => tx.query("select public.admin_import($1::jsonb)", [payload]))).rejects.toThrow(/yalnızca yöneticilere açık/);
      expect(await db.rows("select 1 from public.universities where slug = 'bogazici'")).toEqual([]);
      expect(await count(member, "imports")).toBe(0);
    });
  });

  describe("yönetici", () => {
    it("yönetici sayılır", async () => {
      const rows = await db.as(admin, async (tx) => (await tx.query<{ ok: boolean }>("select public.is_admin() as ok")).rows);
      expect(rows[0].ok).toBe(true);
    });

    it("taslakları ve gizli ilanları da görür", async () => {
      expect(await count(admin, "calls")).toBe(2);
      expect(await count(admin, "listings")).toBe(3);
      const rows = await db.as(admin, async (tx) => (await tx.query("select id, listing_count, open_count from public.call_overview order by title")).rows);
      expect(rows).toEqual([
        { id: C_DRAFT, listing_count: 1, open_count: 1 },
        { id: C_LIVE, listing_count: 2, open_count: 1 },
      ]);
    });

    it("kayıt ekler, değiştirir ve siler", async () => {
      expect(await affected(admin, "insert into public.universities (slug, name) values ('gecici', 'Geçici Üniversite')")).toBe(1);
      expect(await affected(admin, "update public.universities set city = 'Ankara' where slug = 'gecici'")).toBe(1);
      expect(await db.rows("select city from public.universities where slug = 'gecici'")).toEqual([{ city: "Ankara" }]);
      expect(await affected(admin, "delete from public.universities where slug = 'gecici'")).toBe(1);
    });

    it("başka üniversitenin programını ilana bağlayamaz", async () => {
      await expect(
        affected(admin, `insert into public.listings (university_id, call_id, program_id, degree) values ('${U1}', '${C_DRAFT}', '${P_OTHER}', 'doktora')`),
      ).rejects.toThrow(/foreign key/);
    });

    it("aynı ilanı iki kez ekleyemez", async () => {
      await expect(
        affected(admin, `insert into public.listings (university_id, call_id, program_id, degree) values ('${U1}', '${C_DRAFT}', '${P1}', 'yl-tezli')`),
      ).rejects.toThrow(/duplicate key/);
    });

    it("ilanı olan programı ve programı olan üniversiteyi silemez", async () => {
      await expect(affected(admin, `delete from public.programs where id = '${P1}'`)).rejects.toThrow(/foreign key/);
      await expect(affected(admin, `delete from public.universities where id = '${U1}'`)).rejects.toThrow(/foreign key/);
    });

    it("dönem ilanını silince ilanları da silinir", async () => {
      expect(await affected(admin, `delete from public.calls where id = '${C_DRAFT}'`)).toBe(1);
      expect(await db.rows(`select 1 from public.listings where id = '${L_DRAFT}'`)).toEqual([]);
      expect((await db.rows("select 1 from public.listings")).length).toBe(2);
    });
  });
});

describe("yayına alma ve zaman damgaları", () => {
  let db: TestDb;
  let admin: { id: string };

  beforeAll(async () => {
    db = await createTestDb();
    admin = await db.createUser({ admin: true });
    await db.pg.exec(SEED);
    // Tetikleyicileri atlayarak eski bir tarih yaz; böylece "değişti mi" sorusu saat hassasiyetine bağlı kalmaz.
    await db.pg.exec(`
      set session_replication_role = replica;
      update public.calls set updated_at = '2020-01-01T00:00:00Z', published_at = null;
      update public.listings set updated_at = '2020-01-01T00:00:00Z';
      set session_replication_role = origin;
    `);
  });
  afterAll(() => db.close());

  const OLD = new Date("2020-01-01T00:00:00Z").getTime();
  const call = async (id: string) =>
    (await db.rows<{ status: string; published_at: Date | null; updated_at: Date }>("select status, published_at, updated_at from public.calls where id = $1", [id]))[0];
  const visibleToAnon = (id: string) => db.as("anon", async (tx) => (await tx.query("select 1 from public.calls where id = $1", [id])).rows.length === 1);

  it("değişmeyen satırın güncellenme zamanı korunur", async () => {
    await db.as(admin, (tx) => tx.query(`update public.calls set title = title where id = '${C_DRAFT}'`));
    expect((await call(C_DRAFT)).updated_at.getTime()).toBe(OLD);
    await db.as(admin, (tx) => tx.query(`update public.listings set details = '{}'::jsonb, accepting = true where id = '${L_DRAFT}'`));
    expect((await db.rows<{ updated_at: Date }>(`select updated_at from public.listings where id = '${L_DRAFT}'`))[0].updated_at.getTime()).toBe(OLD);
  });

  it("değişen satırın güncellenme zamanı yenilenir; elle yazılan zaman yok sayılır", async () => {
    await db.as(admin, (tx) => tx.query(`update public.listings set accepting = false, updated_at = '2001-01-01T00:00:00Z' where id = '${L_DRAFT}'`));
    const row = (await db.rows<{ updated_at: Date }>(`select updated_at from public.listings where id = '${L_DRAFT}'`))[0];
    expect(row.updated_at.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("taslak yayına alınınca zamanı yazılır ve herkese görünür olur", async () => {
    expect(await visibleToAnon(C_DRAFT)).toBe(false);
    await db.as(admin, (tx) => tx.query(`update public.calls set status = 'yayinda' where id = '${C_DRAFT}'`));
    const row = await call(C_DRAFT);
    expect(row.status).toBe("yayinda");
    expect(row.published_at!.getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(row.updated_at.getTime()).toBeGreaterThan(OLD);
    expect(await visibleToAnon(C_DRAFT)).toBe(true);
    const listings = await db.as("anon", async (tx) => (await tx.query("select 1 from public.listings where call_id = $1", [C_DRAFT])).rows);
    expect(listings.length).toBe(1);
  });

  it("yayındaki ilan düzenlenince yayın zamanı değişmez", async () => {
    await db.pg.exec(`
      set session_replication_role = replica;
      update public.calls set published_at = '2021-06-01T00:00:00Z' where id = '${C_DRAFT}';
      set session_replication_role = origin;
    `);
    await db.as(admin, (tx) => tx.query(`update public.calls set title = 'Yeni başlık' where id = '${C_DRAFT}'`));
    expect((await call(C_DRAFT)).published_at!.toISOString()).toBe("2021-06-01T00:00:00.000Z");
  });

  it("yayından kaldırılınca gizlenir, yeniden yayına alınınca zamanı yenilenir", async () => {
    await db.as(admin, (tx) => tx.query(`update public.calls set status = 'taslak' where id = '${C_DRAFT}'`));
    expect(await visibleToAnon(C_DRAFT)).toBe(false);
    expect((await call(C_DRAFT)).published_at!.toISOString()).toBe("2021-06-01T00:00:00.000Z");
    await db.as(admin, (tx) => tx.query(`update public.calls set status = 'yayinda' where id = '${C_DRAFT}'`));
    expect((await call(C_DRAFT)).published_at!.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("doğrudan yayında eklenen ilanın zamanı da yazılır", async () => {
    await db.as(admin, (tx) =>
      tx.query(`insert into public.calls (university_id, academic_year, semester, title, status) values ('${U2}', 2026, 'bahar', 'Doğrudan', 'yayinda')`),
    );
    const rows = await db.rows<{ published_at: Date | null }>("select published_at from public.calls where title = 'Doğrudan'");
    expect(rows[0].published_at).not.toBeNull();
  });
});

describe("kısıtlar", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await db.pg.exec(SEED);
  });
  afterAll(() => db.close());

  it.each([
    ["büyük harfli kısa ad", "insert into public.universities (slug, name) values ('Ornek-2', 'Ad')"],
    ["http ile başlamayan adres", "insert into public.universities (slug, name, website) values ('ornek-2', 'Ad', 'javascript:alert(1)')"],
    ["bilinmeyen üniversite türü", "insert into public.universities (slug, name, kind) values ('ornek-2', 'Ad', 'ozel')"],
    ["bilinmeyen dönem", `insert into public.calls (university_id, academic_year, semester, title) values ('${U2}', 2026, 'kis', 'Başlık')`],
    ["bilinmeyen durum", `insert into public.calls (university_id, academic_year, semester, title, status) values ('${U2}', 2026, 'yaz', 'Başlık', 'silindi')`],
    [
      "başlangıçtan önce biten başvuru",
      `insert into public.calls (university_id, academic_year, semester, title, application_start, application_end)
       values ('${U2}', 2026, 'yaz', 'Başlık', '2026-12-21T17:00:00+03:00', '2026-12-14T10:00:00+03:00')`,
    ],
    ["liste olmayan takvim", `insert into public.calls (university_id, academic_year, semester, title, timeline) values ('${U2}', 2026, 'yaz', 'Başlık', '{}'::jsonb)`],
    ["bilinmeyen derece", `insert into public.listings (university_id, call_id, program_id, degree) values ('${U1}', '${C_DRAFT}', '${P2}', 'lisans')`],
    ["100'den büyük ALES", `insert into public.listings (university_id, call_id, program_id, degree, ales_say_min) values ('${U1}', '${C_DRAFT}', '${P2}', 'doktora', 101)`],
    ["4'ten büyük not ortalaması", `insert into public.listings (university_id, call_id, program_id, degree, gpa_min4) values ('${U1}', '${C_DRAFT}', '${P2}', 'doktora', 4.5)`],
    ["eksi kontenjan", `insert into public.listings (university_id, call_id, program_id, degree, quota_total) values ('${U1}', '${C_DRAFT}', '${P2}', 'doktora', -1)`],
    ["nesne olmayan ayrıntı", `insert into public.listings (university_id, call_id, program_id, degree, details) values ('${U1}', '${C_DRAFT}', '${P2}', 'doktora', '[]'::jsonb)`],
    ["aynı dönem için ikinci ilan", `insert into public.calls (university_id, academic_year, semester, title) values ('${U1}', 2026, 'bahar', 'İkinci')`],
    ["aynı kısa adla ikinci program", `insert into public.programs (university_id, slug, name) values ('${U1}', 'fizik', 'Fizik 2')`],
  ])("%s reddedilir", async (_label, sql) => {
    await expect(db.pg.exec(sql)).rejects.toThrow(/violates|duplicate key/);
  });
});

describe("içe aktarma (admin_import)", () => {
  let db: TestDb;
  let admin: { id: string };

  type Summary = {
    university_id: string;
    call_id: string | null;
    university_new: boolean;
    call_new: boolean;
    programs_new: number;
    listings_new: number;
    listings_updated: number;
    listings_unchanged: number;
    rules: number;
  };

  const run = (payload: unknown, fileName: string | null = "ornek.json", actor: Actor = admin) =>
    db.as(actor, async (tx) => (await tx.query<{ result: Summary }>("select public.admin_import($1::jsonb, $2) as result", [JSON.stringify(payload), fileName])).rows[0].result);

  beforeAll(async () => {
    db = await createTestDb();
    admin = await db.createUser({ admin: true });
  });
  afterAll(() => db.close());

  let first: Summary;
  let payload: ImportPayload;

  it("dosyayı taslak olarak kaydeder", async () => {
    payload = toPayload(sampleDoc());
    first = await run(payload);
    expect(first).toMatchObject({ university_new: true, call_new: true, programs_new: 2, listings_new: 3, listings_updated: 0, listings_unchanged: 0, rules: 1 });

    expect(await db.rows("select slug, name, short_name, city, kind, website from public.universities")).toEqual([
      { slug: "bogazici", name: "Boğaziçi Üniversitesi", short_name: "Boğaziçi", city: "İstanbul", kind: "devlet", website: "https://bogazici.edu.tr" },
    ]);
    expect(await db.rows("select slug, name, institute, field, url from public.programs order by slug")).toEqual([
      { slug: "bilgisayar-muhendisligi", name: "Bilgisayar Mühendisliği", institute: "Fen Bilimleri Enstitüsü", field: "muhendislik", url: "https://cmpe.bogazici.edu.tr/" },
      { slug: "isletme", name: "İşletme", institute: "Sosyal Bilimler Enstitüsü", field: null, url: null },
    ]);

    const calls = await db.rows<Record<string, unknown>>(
      "select id, institute, academic_year, semester, title, status, published_at, timeline, source_checked_on::text as checked, application_end from public.calls",
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      id: first.call_id,
      institute: "",
      academic_year: 2026,
      semester: "bahar",
      title: "2026-2027 Bahar Lisansüstü Başvuruları",
      status: "taslak",
      published_at: null,
      timeline: [{ label: "Bilim sınavı", date: "2026-12-25", endDate: "2026-12-29" }],
      checked: "2026-11-28",
    });
    expect((calls[0].application_end as Date).toISOString()).toBe("2026-12-21T14:00:00.000Z");
  });

  it("şartları ve filtre sütunlarını yazar", async () => {
    const rows = await db.rows<Record<string, unknown>>(
      `select p.slug, l.degree, l.mode, l.language, l.accepting, l.hidden, l.quota_total, l.ales_required,
              l.ales_say_min::float8 as say, l.ales_ea_min, l.gpa_min4::float8 as gpa, l.lang_required, l.yds_min::float8 as yds, l.details
       from public.listings l join public.programs p on p.id = l.program_id order by p.slug, l.degree`,
    );
    expect(rows.map(({ details: _details, ...rest }) => rest)).toEqual([
      { slug: "bilgisayar-muhendisligi", degree: "doktora", mode: "orgun", language: "en", accepting: true, hidden: false, quota_total: 10, ales_required: true, say: 80, ales_ea_min: null, gpa: 3, lang_required: true, yds: 55 },
      { slug: "bilgisayar-muhendisligi", degree: "yl-tezli", mode: "orgun", language: "en", accepting: true, hidden: false, quota_total: 31, ales_required: true, say: 70, ales_ea_min: null, gpa: 2.5, lang_required: true, yds: null },
      { slug: "isletme", degree: "yl-tezsiz", mode: "orgun", language: "en", accepting: false, hidden: false, quota_total: null, ales_required: null, say: null, ales_ea_min: null, gpa: null, lang_required: null, yds: null },
    ]);
    expect(rows[1].details).toEqual(payload.listings[0].details);
    expect(rows[2].details).toEqual({});
  });

  it("genel kuralları ve içe aktarma kaydını yazar", async () => {
    expect(await db.rows("select institute, degree, notes, details from public.university_rules")).toEqual([
      { institute: "", degree: "doktora", notes: "Yönetmelikteki alt sınırlar.", details: { ales: { required: true, options: [{ type: "SAY", min: 55 }] } } },
    ]);
    const logs = await db.rows<Record<string, unknown>>("select created_by, university_id, call_id, file_name, summary, payload from public.imports");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ created_by: admin.id, university_id: first.university_id, call_id: first.call_id, file_name: "ornek.json" });
    expect(logs[0].summary).toMatchObject({ listings_new: 3, programs_new: 2 });
    expect(logs[0].payload).toEqual(JSON.parse(JSON.stringify(payload)));
  });

  it("taslak herkese kapalıdır", async () => {
    const seen = await db.as("anon", async (tx) => ({
      calls: (await tx.query("select 1 from public.calls")).rows.length,
      listings: (await tx.query("select 1 from public.listings")).rows.length,
    }));
    expect(seen).toEqual({ calls: 0, listings: 0 });
  });

  it("aynı dosya yeniden yüklenince hiçbir şey değişmez", async () => {
    await db.pg.exec(`
      set session_replication_role = replica;
      update public.listings set updated_at = '2020-01-01T00:00:00Z';
      update public.calls set updated_at = '2020-01-01T00:00:00Z';
      update public.programs set updated_at = '2020-01-01T00:00:00Z';
      update public.universities set updated_at = '2020-01-01T00:00:00Z';
      update public.university_rules set updated_at = '2020-01-01T00:00:00Z';
      set session_replication_role = origin;
    `);
    const again = await run(payload);
    expect(again).toMatchObject({
      university_id: first.university_id,
      call_id: first.call_id,
      university_new: false,
      call_new: false,
      programs_new: 0,
      listings_new: 0,
      listings_updated: 0,
      listings_unchanged: 3,
    });
    for (const table of ["listings", "calls", "programs", "universities", "university_rules"]) {
      const touched = await db.rows(`select 1 from public.${table} where updated_at > '2020-01-02T00:00:00Z'`);
      expect(touched, table).toEqual([]);
    }
    expect((await db.rows("select 1 from public.listings")).length).toBe(3);
    expect((await db.rows("select 1 from public.imports")).length).toBe(2);
  });

  it("değişen ve eklenen ilanları ayırır; dosyada olmayana dokunmaz", async () => {
    const doc = sampleDoc();
    (doc.listings[0].details as { quota: { main: number } }).quota.main = 25;
    doc.listings.splice(1, 2);
    doc.listings.push({ program: { name: "Fizik", institute: "Fen Bilimleri Enstitüsü" }, degree: "yl-tezli", language: "en", details: { quota: { main: 5 } } } as never);
    const result = await run(toPayload(doc));
    expect(result).toMatchObject({ programs_new: 1, listings_new: 1, listings_updated: 1, listings_unchanged: 0 });

    const rows = await db.rows(
      `select p.slug, l.degree, l.quota_total, l.updated_at > '2020-01-02T00:00:00Z' as touched
       from public.listings l join public.programs p on p.id = l.program_id order by p.slug, l.degree`,
    );
    expect(rows).toEqual([
      { slug: "bilgisayar-muhendisligi", degree: "doktora", quota_total: 10, touched: false },
      { slug: "bilgisayar-muhendisligi", degree: "yl-tezli", quota_total: 26, touched: true },
      { slug: "fizik", degree: "yl-tezli", quota_total: 5, touched: true },
      { slug: "isletme", degree: "yl-tezsiz", quota_total: null, touched: false },
    ]);
  });

  it("dosyada yazmayan üniversite ve program bilgisi kayıtlı değeri silmez", async () => {
    const doc = sampleDoc();
    doc.university = { slug: "bogazici", name: "Boğaziçi Üniversitesi" } as never;
    doc.listings = [{ program: { name: "Bilgisayar Mühendisliği" }, degree: "yl-tezli", language: "en", details: doc.listings[0].details } as never];
    await run(toPayload(doc));
    expect(await db.rows("select short_name, city, kind, website from public.universities")).toEqual([
      { short_name: "Boğaziçi", city: "İstanbul", kind: "devlet", website: "https://bogazici.edu.tr" },
    ]);
    expect(await db.rows("select institute, field, url from public.programs where slug = 'bilgisayar-muhendisligi'")).toEqual([
      { institute: "Fen Bilimleri Enstitüsü", field: "muhendislik", url: "https://cmpe.bogazici.edu.tr/" },
    ]);
  });

  it("yayın durumunu ve gizlenen ilanı korur", async () => {
    await db.as(admin, async (tx) => {
      await tx.query("update public.calls set status = 'yayinda' where id = $1", [first.call_id]);
      await tx.query("update public.listings set hidden = true where degree = 'yl-tezsiz'");
    });
    const result = await run(payload);
    expect(result.call_new).toBe(false);
    expect(await db.rows("select status from public.calls")).toEqual([{ status: "yayinda" }]);
    expect(await db.rows("select hidden from public.listings where degree = 'yl-tezsiz'")).toEqual([{ hidden: true }]);
    const seen = await db.as("anon", async (tx) => (await tx.query("select 1 from public.listings")).rows.length);
    expect(seen).toBe(3);
  });

  it("hatalı bir satır varsa hiçbir şey kaydetmez", async () => {
    const broken = JSON.parse(JSON.stringify(toPayload(sampleDoc()))) as ImportPayload;
    broken.university = { ...broken.university, slug: "yeni-universite", name: "Yeni Üniversite" };
    (broken.listings[2] as { degree: string }).degree = "lisans";
    const before = (await db.rows("select 1 from public.imports")).length;
    await expect(run(broken)).rejects.toThrow(/violates check constraint/);
    expect(await db.rows("select 1 from public.universities where slug = 'yeni-universite'")).toEqual([]);
    expect((await db.rows("select 1 from public.imports")).length).toBe(before);
  });

  it("yalnızca genel kural taşıyan dosyayı kabul eder", async () => {
    const result = await run(
      toPayload({
        format: "lisansustu-ilan/1",
        university: { slug: "khas", name: "Kadir Has Üniversitesi", kind: "vakif", city: "İstanbul" },
        rules: [
          { degree: "yl-tezli", details: { ales: { required: true, options: [{ type: "SAY", min: 55 }, { type: "EA", min: 55 }] } } },
          { degree: "yl-tezsiz", details: { ales: { required: false } } },
        ],
      }),
      null,
    );
    expect(result).toMatchObject({ university_new: true, call_new: false, call_id: null, rules: 2, listings_new: 0 });
    expect((await db.rows("select 1 from public.university_rules r join public.universities u on u.id = r.university_id where u.slug = 'khas'")).length).toBe(2);
    expect((await db.rows("select 1 from public.calls c join public.universities u on u.id = c.university_id where u.slug = 'khas'")).length).toBe(0);
  });

  it("dönemi yazılmamış ilanları reddeder", async () => {
    const orphan = JSON.parse(JSON.stringify(toPayload(sampleDoc()))) as ImportPayload;
    orphan.call = null;
    await expect(run(orphan)).rejects.toThrow(/hangi döneme ait/);
  });

  it.each([
    ["liste", []],
    ["boş nesne", {}],
    ["metin", "merhaba"],
    ["üniversitesi liste olan nesne", { university: [] }],
  ])("biçimi bozuk girdiyi reddeder: %s", async (_label, input) => {
    await expect(run(input)).rejects.toThrow(/Dosya biçimi tanınmadı/);
  });
});
