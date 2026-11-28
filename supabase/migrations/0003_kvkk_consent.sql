-- Adım 2: KVKK Aydınlatma Metni onayının zamanı.
-- E-posta ile kayıtta onay kutusu kayıt formundadır; Google ile gelen üyeler ilk girişte onaylar.
-- Onay zamanı boşsa üyeden profilini tamamlaması istenir.

alter table public.profiles add column kvkk_accepted_at timestamptz;

grant update (kvkk_accepted_at) on public.profiles to authenticated;

-- Kayıt formunda onay kutusu işaretlendiyse zamanı kayıt anında yazılır.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_phone text := meta ->> 'phone';
begin
  insert into public.profiles (id, full_name, phone, school, kvkk_accepted_at)
  values (
    new.id,
    nullif(left(btrim(meta ->> 'full_name'), 120), ''),
    case when v_phone ~ '^05[0-9]{9}$' then v_phone end,
    nullif(left(btrim(meta ->> 'school'), 160), ''),
    case when meta ->> 'kvkk_accepted' = 'true' then now() end
  );
  return new;
end;
$$;

-- Onay zamanı bir kez ve sunucu saatiyle yazılır; sonradan değiştirilemez ya da silinemez.
-- Kural yönetim işlemleri dahil herkes için geçerlidir. Metin değişir de yeniden onay gerekirse
-- bu, yeni bir migration dosyasıyla ele alınır.
create function public.profiles_guard_consent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.kvkk_accepted_at is not null then
    new.kvkk_accepted_at := old.kvkk_accepted_at;
  elsif new.kvkk_accepted_at is not null then
    new.kvkk_accepted_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.profiles_guard_consent() from public, anon, authenticated;

create trigger profiles_guard_consent
  before update on public.profiles
  for each row execute function public.profiles_guard_consent();
