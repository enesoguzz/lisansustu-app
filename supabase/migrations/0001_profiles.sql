-- Adım 2: Üye profilleri.
-- Kimlik (e-posta, şifre) Supabase Auth'ta tutulur; burada ek bilgiler ve rol var.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  school text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Üye kendi profilini görür"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Üye kendi profilini günceller"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Üye yalnızca bu sütunları değiştirebilir; "role" sütununu değiştiremez.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone, school) on public.profiles to authenticated;

-- Yeni üye kaydında profil satırını otomatik oluştur.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone, school)
  values (
    new.id,
    nullif(left(new.raw_user_meta_data ->> 'full_name', 120), ''),
    nullif(left(new.raw_user_meta_data ->> 'phone', 20), ''),
    nullif(left(new.raw_user_meta_data ->> 'school', 160), '')
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.touch_updated_at() from public, anon, authenticated;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
