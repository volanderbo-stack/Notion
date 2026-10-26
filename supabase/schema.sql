-- Розумна галерея: спільна галерея в Supabase.
-- Запустити один раз: Supabase → SQL Editor → New query → вставити весь файл → Run.
-- Повторний запуск безпечний.
--
-- Модель: один проєкт Supabase = одна спільна галерея.
-- Учасники входять анонімно (без пошти й паролів) і приєднуються за кодом запрошення.
-- Усі дані доступні лише учасникам: це перевіряють правила RLS у базі й у сховищі файлів.

create extension if not exists pgcrypto with schema extensions;

-- ---------- Таблиці ----------

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Спільна галерея',
  invite_code text not null unique,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  space_id uuid not null references public.spaces on delete cascade,
  user_id uuid not null default auth.uid(),
  name text not null default '',
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

-- Елементи, теми й налаштування галереї (назви сердечок) — як JSON.
-- client_updated — час зміни на пристрої (перемагає новіша зміна),
-- updated_at — час на сервері (за ним пристрої забирають нове).
create table if not exists public.records (
  space_id uuid not null references public.spaces on delete cascade,
  kind text not null check (kind in ('item', 'theme', 'meta')),
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  client_updated bigint not null,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (space_id, kind, id)
);
create index if not exists records_space_updated on public.records (space_id, updated_at);

-- ---------- Перевірка участі ----------

create or replace function public.is_member(p_space uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where space_id = p_space and user_id = auth.uid())
$$;

alter table public.spaces enable row level security;
alter table public.members enable row level security;
alter table public.records enable row level security;

drop policy if exists "spaces: members read" on public.spaces;
create policy "spaces: members read" on public.spaces for select to authenticated using (is_member(id));
drop policy if exists "spaces: members rename" on public.spaces;
create policy "spaces: members rename" on public.spaces for update to authenticated using (is_member(id)) with check (is_member(id));

drop policy if exists "members: members read" on public.members;
create policy "members: members read" on public.members for select to authenticated using (is_member(space_id));
drop policy if exists "members: members remove" on public.members;
create policy "members: members remove" on public.members for delete to authenticated using (is_member(space_id));
drop policy if exists "members: rename self" on public.members;
create policy "members: rename self" on public.members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "records: members read" on public.records;
create policy "records: members read" on public.records for select to authenticated using (is_member(space_id));
-- Запис — лише через push_records (нижче), щоб старіша зміна не затерла новішу

-- ---------- Функції ----------

create or replace function public.make_invite_code()
returns text language sql volatile set search_path = public, extensions as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 32), 1), '')
  from (select gen_random_bytes(10) as b) r, generate_series(0, 9) i
$$;

-- Створити галерею може лише перший: у проєкті одна галерея, решта приєднується за кодом
create or replace function public.create_space(p_name text, p_member text)
returns public.spaces language plpgsql security definer set search_path = public as $$
declare s spaces;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from spaces) then raise exception 'space exists'; end if;
  insert into spaces (name, invite_code, created_by) values (coalesce(nullif(trim(p_name), ''), 'Спільна галерея'), make_invite_code(), auth.uid()) returning * into s;
  insert into members (space_id, user_id, name) values (s.id, auth.uid(), coalesce(p_member, ''));
  return s;
end $$;

create or replace function public.join_space(p_code text, p_member text)
returns public.spaces language plpgsql security definer set search_path = public as $$
declare s spaces;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into s from spaces where invite_code = upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));
  if s.id is null then raise exception 'bad code'; end if;
  insert into members (space_id, user_id, name) values (s.id, auth.uid(), coalesce(p_member, ''))
  on conflict (space_id, user_id) do update set name = excluded.name;
  return s;
end $$;

-- Новий код: старе запрошення перестає працювати (хто вже в галереї — лишається)
create or replace function public.new_invite_code(p_space uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not is_member(p_space) then raise exception 'not a member'; end if;
  update spaces set invite_code = make_invite_code() where id = p_space returning invite_code into c;
  return c;
end $$;

-- p_rows: [{ kind, id, data, deleted, updated }]; новіша зміна перемагає
create or replace function public.push_records(p_space uuid, p_rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_space) then raise exception 'not a member'; end if;
  insert into records (space_id, kind, id, data, deleted, client_updated)
  select p_space, r->>'kind', r->>'id', r->'data', coalesce((r->>'deleted')::boolean, false), (r->>'updated')::bigint
  from jsonb_array_elements(p_rows) r
  on conflict (space_id, kind, id) do update
    set data = excluded.data, deleted = excluded.deleted, client_updated = excluded.client_updated, updated_at = clock_timestamp()
    where records.client_updated <= excluded.client_updated;
end $$;

revoke execute on function public.create_space(text, text), public.join_space(text, text),
  public.new_invite_code(uuid), public.push_records(uuid, jsonb), public.make_invite_code() from public, anon;
grant execute on function public.create_space(text, text), public.join_space(text, text),
  public.new_invite_code(uuid), public.push_records(uuid, jsonb) to authenticated;

-- ---------- Миттєві оновлення ----------

do $$ begin
  alter publication supabase_realtime add table public.records;
exception when duplicate_object then null; end $$;

-- ---------- Файли (фото, відео, голосові) ----------
-- Шлях файлу: <id галереї>/<ключ файлу>. Бакет приватний.

insert into storage.buckets (id, name, public) values ('gallery', 'gallery', false)
on conflict (id) do nothing;

drop policy if exists "gallery: members read" on storage.objects;
create policy "gallery: members read" on storage.objects for select to authenticated
  using (bucket_id = 'gallery' and public.is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "gallery: members upload" on storage.objects;
create policy "gallery: members upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'gallery' and public.is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "gallery: members replace" on storage.objects;
create policy "gallery: members replace" on storage.objects for update to authenticated
  using (bucket_id = 'gallery' and public.is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "gallery: members delete" on storage.objects;
create policy "gallery: members delete" on storage.objects for delete to authenticated
  using (bucket_id = 'gallery' and public.is_member(((storage.foldername(name))[1])::uuid));
