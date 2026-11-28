-- Adım 3: Üniversiteler, programlar, dönem ilanları, ilanlar ve yönetici yetkisi.
--
-- İlan = bir programın bir derecesinin bir dönemdeki çağrısı (ör. Bilgisayar Mühendisliği, Doktora, 2026-2027 Bahar).
-- Şartların ayrıntısı `details` sütununda yapılandırılmış olarak durur (biçimi packages/core/src/listing.ts tanımlar);
-- filtrelemede kullanılacak birkaç değer aynı koddan türetilip ayrı sütunlara yazılır.
--
-- Erişim: yayındaki veriyi herkes okur. Yazma ve taslakları görme yalnızca yöneticiye (profiles.role = 'admin') açıktır.

-- ---------------------------------------------------------------- yönetici kontrolü

-- İsteği yapan üye yönetici mi? Erişim kuralları ve içe aktarma bu fonksiyonu kullanır.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Rol artık gerçek bir yetki taşıyor. Üyenin "role" sütununu değiştirmesini bugün sütun izinleri engelliyor
-- (0001); bu tetikleyici ikinci kilittir: ileride bir dosya izinleri yanlışlıkla genişletse bile
-- API'den gelen istek rolü değiştiremez. Rol yalnızca SQL Editor'dan (veritabanı sahibi olarak) verilir.
create function public.profiles_guard_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role and current_user in ('anon', 'authenticated') then
    raise exception 'Rol API üzerinden değiştirilemez.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.profiles_guard_role() from public, anon, authenticated;

create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.profiles_guard_role();

-- Satır gerçekten değiştiyse güncellenme zamanını yeniler. Aynı dosya yeniden içe aktarıldığında
-- değişmeyen kayıtların zamanı korunur; böylece "güncellendi" bilgisi anlamını yitirmez.
create function public.touch_if_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if to_jsonb(new) - 'updated_at' is distinct from to_jsonb(old) - 'updated_at' then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

revoke execute on function public.touch_if_changed() from public, anon, authenticated;

-- ---------------------------------------------------------------- tablolar

create table public.universities (
  id uuid primary key default gen_random_uuid(),
  -- Adreste ve içe aktarma dosyalarında kullanılan kısa ad: "bogazici"
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  short_name text check (char_length(short_name) <= 60),
  city text check (char_length(city) <= 60),
  kind text check (kind in ('devlet', 'vakif')),
  website text check (website ~* '^https?://' and char_length(website) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name text not null check (char_length(btrim(name)) between 2 and 200),
  institute text check (char_length(institute) <= 160),
  -- Alan kategorisi; geçerli değerler packages/core/src/catalog.ts içindeki FIELDS listesidir.
  field text check (field ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(field) <= 40),
  url text check (url ~* '^https?://' and char_length(url) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (university_id, slug),
  unique (id, university_id)
);

-- Dönem ilanı: bir üniversitenin (ya da bir enstitüsünün) bir dönem için açtığı çağrı.
create table public.calls (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete restrict,
  -- Boş metin: ilan üniversitenin tamamı için.
  institute text not null default '' check (char_length(institute) <= 160),
  -- Akademik yılın başladığı yıl: 2026-2027 için 2026.
  academic_year integer not null check (academic_year between 2020 and 2100),
  semester text not null check (semester in ('guz', 'bahar', 'yaz')),
  title text not null check (char_length(btrim(title)) between 2 and 200),
  application_start timestamptz,
  application_end timestamptz,
  -- Diğer tarihler: [{ "label": "Bilim sınavı", "date": "2026-12-25", "endDate": "2026-12-29", "time": "...", "note": "..." }]
  timeline jsonb not null default '[]'::jsonb check (jsonb_typeof(timeline) = 'array'),
  notes text check (char_length(notes) <= 4000),
  apply_url text check (apply_url ~* '^https?://' and char_length(apply_url) <= 500),
  source_url text check (source_url ~* '^https?://' and char_length(source_url) <= 500),
  source_checked_on date,
  status text not null default 'taslak' check (status in ('taslak', 'yayinda')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (university_id, institute, academic_year, semester),
  unique (id, university_id),
  check (application_start is null or application_end is null or application_end >= application_start)
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null,
  call_id uuid not null,
  program_id uuid not null,
  degree text not null check (degree in ('yl-tezli', 'yl-tezsiz', 'doktora', 'butunlesik-doktora', 'sanatta-yeterlik')),
  mode text not null default 'orgun' check (mode in ('orgun', 'ikinci-ogretim', 'uzaktan')),
  language text not null default 'tr' check (language in ('tr', 'en', 'tr-en', 'diger')),
  -- false: program bu dönem öğrenci almıyor.
  accepting boolean not null default true,
  -- true: yayındaki bir ilanın içinde olsa da sitede gösterilmez.
  hidden boolean not null default false,
  -- Programa özel son başvuru; boşsa dönem ilanındaki tarih geçerlidir.
  application_end timestamptz,
  -- Filtre sütunları. `details` alanından türetilir (packages/core: deriveColumns), elle yazılmaz.
  quota_total integer check (quota_total >= 0),
  ales_required boolean,
  ales_say_min numeric(5, 2) check (ales_say_min between 0 and 100),
  ales_soz_min numeric(5, 2) check (ales_soz_min between 0 and 100),
  ales_ea_min numeric(5, 2) check (ales_ea_min between 0 and 100),
  gpa_min4 numeric(3, 2) check (gpa_min4 between 0 and 4),
  gpa_min100 numeric(5, 2) check (gpa_min100 between 0 and 100),
  lang_required boolean,
  yds_min numeric(5, 2) check (yds_min between 0 and 100),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  source_url text check (source_url ~* '^https?://' and char_length(source_url) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (call_id, program_id, degree, mode, language),
  -- Dönem ilanı ve program aynı üniversiteye ait olmalı.
  foreign key (call_id, university_id) references public.calls (id, university_id) on delete cascade,
  foreign key (program_id, university_id) references public.programs (id, university_id) on delete restrict
);

create index listings_program_id_idx on public.listings (program_id);
create index listings_university_id_idx on public.listings (university_id);

-- Üniversitenin (ya da enstitünün) bir derece için genel kuralları. İlanda yazmayan şartlar buradan tamamlanır.
create table public.university_rules (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  institute text not null default '' check (char_length(institute) <= 160),
  degree text not null check (degree in ('yl-tezli', 'yl-tezsiz', 'doktora', 'butunlesik-doktora', 'sanatta-yeterlik')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  notes text check (char_length(notes) <= 4000),
  source_url text check (source_url ~* '^https?://' and char_length(source_url) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (university_id, institute, degree)
);

-- İçe aktarma kaydı: kim, ne zaman, hangi dosyayı yükledi.
create table public.imports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  university_id uuid references public.universities (id) on delete set null,
  call_id uuid references public.calls (id) on delete set null,
  file_name text check (char_length(file_name) <= 200),
  summary jsonb not null default '{}'::jsonb,
  payload jsonb not null
);

-- ---------------------------------------------------------------- tetikleyiciler

create trigger universities_touch before update on public.universities
  for each row execute function public.touch_if_changed();
create trigger programs_touch before update on public.programs
  for each row execute function public.touch_if_changed();
create trigger calls_touch before update on public.calls
  for each row execute function public.touch_if_changed();
create trigger listings_touch before update on public.listings
  for each row execute function public.touch_if_changed();
create trigger university_rules_touch before update on public.university_rules
  for each row execute function public.touch_if_changed();

-- Yayına alınma zamanını sunucu saatiyle yazar.
create function public.calls_set_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'yayinda' then
      new.published_at := now();
    end if;
  elsif new.status = 'yayinda' and old.status is distinct from 'yayinda' then
    new.published_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.calls_set_published_at() from public, anon, authenticated;

create trigger calls_set_published_at before insert or update on public.calls
  for each row execute function public.calls_set_published_at();

-- ---------------------------------------------------------------- erişim kuralları

alter table public.universities enable row level security;
alter table public.programs enable row level security;
alter table public.calls enable row level security;
alter table public.listings enable row level security;
alter table public.university_rules enable row level security;
alter table public.imports enable row level security;

-- Herkes: üniversite ve program adları ile genel kurallar açık bilgidir.
create policy "Herkes üniversiteleri görür"
  on public.universities for select to anon, authenticated using (true);
create policy "Herkes programları görür"
  on public.programs for select to anon, authenticated using (true);
create policy "Herkes genel kuralları görür"
  on public.university_rules for select to anon, authenticated using (true);

-- Herkes: yalnızca yayına alınmış dönem ilanları ve onların gizlenmemiş ilanları.
create policy "Herkes yayındaki dönem ilanlarını görür"
  on public.calls for select to anon, authenticated using (status = 'yayinda');
create policy "Herkes yayındaki ilanları görür"
  on public.listings for select to anon, authenticated
  using (
    not hidden
    and exists (select 1 from public.calls c where c.id = listings.call_id and c.status = 'yayinda')
  );

-- Yönetici: hepsini görür ve değiştirir.
create policy "Yönetici üniversiteleri yönetir"
  on public.universities for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Yönetici programları yönetir"
  on public.programs for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Yönetici dönem ilanlarını yönetir"
  on public.calls for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Yönetici ilanları yönetir"
  on public.listings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Yönetici genel kuralları yönetir"
  on public.university_rules for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Yönetici içe aktarma kayıtlarını görür"
  on public.imports for select to authenticated using ((select public.is_admin()));
create policy "Yönetici içe aktarma kaydı ekler"
  on public.imports for insert to authenticated with check ((select public.is_admin()));

-- Bu projede yeni tablolar API'ye kendiliğinden açılmaz; izinler açıkça verilir.
revoke all on public.universities, public.programs, public.calls, public.listings, public.university_rules, public.imports
  from anon, authenticated;
grant select on public.universities, public.programs, public.calls, public.listings, public.university_rules
  to anon, authenticated;
grant insert, update, delete on public.universities, public.programs, public.calls, public.listings, public.university_rules
  to authenticated;
grant select, insert on public.imports to authenticated;

-- ---------------------------------------------------------------- özet görünüm

-- Dönem ilanları, üniversite adı ve ilan sayılarıyla. Erişim kuralları sorgulayan kişiye göre uygulanır.
create view public.call_overview
with (security_invoker = true)
as
select
  c.id,
  c.university_id,
  u.slug as university_slug,
  u.name as university_name,
  u.short_name as university_short_name,
  c.institute,
  c.academic_year,
  c.semester,
  c.title,
  c.application_start,
  c.application_end,
  c.status,
  c.published_at,
  c.updated_at,
  (select count(*) from public.listings l where l.call_id = c.id)::integer as listing_count,
  (select count(*) from public.listings l where l.call_id = c.id and l.accepting)::integer as open_count
from public.calls c
join public.universities u on u.id = c.university_id;

revoke all on public.call_overview from anon, authenticated;
grant select on public.call_overview to anon, authenticated;

-- ---------------------------------------------------------------- içe aktarma

-- Bir içe aktarma dosyasını tek işlemde yazar: ya hepsi kaydedilir ya hiçbiri.
-- Dosyayı site denetler ve hazırlar (packages/core: parseImport); buradaki kısıtlar son güvencedir.
-- Kayıtlar kısa adlarıyla eşleştirilir: olan güncellenir, olmayan eklenir, dosyada bulunmayana dokunulmaz.
-- Yayın durumu (calls.status) ve gizleme (listings.hidden) içe aktarmayla değişmez.
create function public.admin_import(payload jsonb, file_name text default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_uni jsonb := payload -> 'university';
  v_call jsonb := payload -> 'call';
  v_rules jsonb := case when jsonb_typeof(payload -> 'rules') = 'array' then payload -> 'rules' else '[]'::jsonb end;
  v_listings jsonb := case when jsonb_typeof(payload -> 'listings') = 'array' then payload -> 'listings' else '[]'::jsonb end;
  v_item jsonb;
  v_prog jsonb;
  v_uni_id uuid;
  v_call_id uuid;
  v_prog_id uuid;
  v_inserted boolean;
  v_touched boolean;
  v_uni_new boolean;
  v_call_new boolean := false;
  n_program_new integer := 0;
  n_listing_new integer := 0;
  n_listing_updated integer := 0;
  n_listing_same integer := 0;
  n_rule integer := 0;
  v_summary jsonb;
begin
  if not public.is_admin() then
    raise exception 'Bu işlem yalnızca yöneticilere açık.' using errcode = '42501';
  end if;
  if jsonb_typeof(payload) is distinct from 'object' or jsonb_typeof(v_uni) is distinct from 'object' then
    raise exception 'Dosya biçimi tanınmadı.' using errcode = '22023';
  end if;

  -- Dosyada yazmayan üniversite bilgisi kayıtlı değeri silmez.
  insert into public.universities as u (slug, name, short_name, city, kind, website)
  values (v_uni ->> 'slug', v_uni ->> 'name', v_uni ->> 'short_name', v_uni ->> 'city', v_uni ->> 'kind', v_uni ->> 'website')
  on conflict (slug) do update set
    name = excluded.name,
    short_name = coalesce(excluded.short_name, u.short_name),
    city = coalesce(excluded.city, u.city),
    kind = coalesce(excluded.kind, u.kind),
    website = coalesce(excluded.website, u.website)
  returning u.id, (u.xmax = 0) into v_uni_id, v_uni_new;

  for v_item in select value from jsonb_array_elements(v_rules) loop
    insert into public.university_rules as r (university_id, institute, degree, details, notes, source_url)
    values (
      v_uni_id,
      coalesce(v_item ->> 'institute', ''),
      v_item ->> 'degree',
      coalesce(v_item -> 'details', '{}'::jsonb),
      v_item ->> 'notes',
      v_item ->> 'source_url'
    )
    on conflict (university_id, institute, degree) do update set
      details = excluded.details,
      notes = excluded.notes,
      source_url = excluded.source_url;
    n_rule := n_rule + 1;
  end loop;

  if jsonb_typeof(v_call) = 'object' then
    insert into public.calls as c (
      university_id, institute, academic_year, semester, title, application_start, application_end,
      timeline, notes, apply_url, source_url, source_checked_on
    )
    values (
      v_uni_id,
      coalesce(v_call ->> 'institute', ''),
      (v_call ->> 'academic_year')::integer,
      v_call ->> 'semester',
      v_call ->> 'title',
      (v_call ->> 'application_start')::timestamptz,
      (v_call ->> 'application_end')::timestamptz,
      case when jsonb_typeof(v_call -> 'timeline') = 'array' then v_call -> 'timeline' else '[]'::jsonb end,
      v_call ->> 'notes',
      v_call ->> 'apply_url',
      v_call ->> 'source_url',
      (v_call ->> 'source_checked_on')::date
    )
    on conflict (university_id, institute, academic_year, semester) do update set
      title = excluded.title,
      application_start = excluded.application_start,
      application_end = excluded.application_end,
      timeline = excluded.timeline,
      notes = excluded.notes,
      apply_url = excluded.apply_url,
      source_url = excluded.source_url,
      source_checked_on = excluded.source_checked_on
    returning c.id, (c.xmax = 0) into v_call_id, v_call_new;

    for v_item in select value from jsonb_array_elements(v_listings) loop
      v_prog := v_item -> 'program';

      -- Dosyada yazmayan enstitü, alan ve adres kayıtlı değeri silmez.
      insert into public.programs as p (university_id, slug, name, institute, field, url)
      values (v_uni_id, v_prog ->> 'slug', v_prog ->> 'name', v_prog ->> 'institute', v_prog ->> 'field', v_prog ->> 'url')
      on conflict (university_id, slug) do update set
        name = excluded.name,
        institute = coalesce(excluded.institute, p.institute),
        field = coalesce(excluded.field, p.field),
        url = coalesce(excluded.url, p.url)
      returning p.id, (p.xmax = 0) into v_prog_id, v_inserted;
      if v_inserted then
        n_program_new := n_program_new + 1;
      end if;

      insert into public.listings as l (
        university_id, call_id, program_id, degree, mode, language, accepting, application_end,
        quota_total, ales_required, ales_say_min, ales_soz_min, ales_ea_min, gpa_min4, gpa_min100,
        lang_required, yds_min, details, source_url
      )
      values (
        v_uni_id,
        v_call_id,
        v_prog_id,
        v_item ->> 'degree',
        coalesce(v_item ->> 'mode', 'orgun'),
        coalesce(v_item ->> 'language', 'tr'),
        coalesce((v_item ->> 'accepting')::boolean, true),
        (v_item ->> 'application_end')::timestamptz,
        (v_item ->> 'quota_total')::integer,
        (v_item ->> 'ales_required')::boolean,
        (v_item ->> 'ales_say_min')::numeric,
        (v_item ->> 'ales_soz_min')::numeric,
        (v_item ->> 'ales_ea_min')::numeric,
        (v_item ->> 'gpa_min4')::numeric,
        (v_item ->> 'gpa_min100')::numeric,
        (v_item ->> 'lang_required')::boolean,
        (v_item ->> 'yds_min')::numeric,
        coalesce(v_item -> 'details', '{}'::jsonb),
        v_item ->> 'source_url'
      )
      on conflict (call_id, program_id, degree, mode, language) do update set
        accepting = excluded.accepting,
        application_end = excluded.application_end,
        quota_total = excluded.quota_total,
        ales_required = excluded.ales_required,
        ales_say_min = excluded.ales_say_min,
        ales_soz_min = excluded.ales_soz_min,
        ales_ea_min = excluded.ales_ea_min,
        gpa_min4 = excluded.gpa_min4,
        gpa_min100 = excluded.gpa_min100,
        lang_required = excluded.lang_required,
        yds_min = excluded.yds_min,
        details = excluded.details,
        source_url = excluded.source_url
      -- Değişmeyen satırın güncellenme zamanı korunur (touch_if_changed); değişenler bu işlemin zamanını taşır.
      returning (l.xmax = 0), (l.updated_at = now()) into v_inserted, v_touched;
      if v_inserted then
        n_listing_new := n_listing_new + 1;
      elsif v_touched then
        n_listing_updated := n_listing_updated + 1;
      else
        n_listing_same := n_listing_same + 1;
      end if;
    end loop;
  elsif jsonb_array_length(v_listings) > 0 then
    raise exception 'İlanların hangi döneme ait olduğu yazılmamış.' using errcode = '22023';
  end if;

  v_summary := jsonb_build_object(
    'university_new', v_uni_new,
    'call_new', v_call_new,
    'programs_new', n_program_new,
    'listings_new', n_listing_new,
    'listings_updated', n_listing_updated,
    'listings_unchanged', n_listing_same,
    'rules', n_rule
  );

  insert into public.imports (university_id, call_id, file_name, summary, payload)
  values (v_uni_id, v_call_id, left(file_name, 200), v_summary, payload);

  return v_summary || jsonb_build_object('university_id', v_uni_id, 'call_id', v_call_id);
end;
$$;

revoke execute on function public.admin_import(jsonb, text) from public, anon;
grant execute on function public.admin_import(jsonb, text) to authenticated;
