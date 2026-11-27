-- Adım 2: Profil alanlarına sunucu tarafı sınırları.
-- Site bu kuralları zaten uyguluyor; buradaki kısıtlar API'ye doğrudan yazılsa da geçerli olur.

alter table public.profiles
  add constraint profiles_full_name_length check (char_length(full_name) <= 120),
  add constraint profiles_phone_format check (phone ~ '^05[0-9]{9}$'),
  add constraint profiles_school_length check (char_length(school) <= 160);

-- Kayıtla gelen bir bilgi kurala uymuyorsa kayıt engellenmez; o alan boş bırakılır.
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
  insert into public.profiles (id, full_name, phone, school)
  values (
    new.id,
    nullif(left(btrim(meta ->> 'full_name'), 120), ''),
    case when v_phone ~ '^05[0-9]{9}$' then v_phone end,
    nullif(left(btrim(meta ->> 'school'), 160), '')
  );
  return new;
end;
$$;
