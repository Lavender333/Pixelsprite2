create extension if not exists pgcrypto;
create extension if not exists citext;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.is_allowed_gamename(name text)
returns boolean
language sql
immutable
as $$
  select
    coalesce(char_length(btrim(name)) between 3 and 18, false)
    and coalesce(name ~ '^[A-Za-z0-9 _.-]+$', false)
    and lower(regexp_replace(name, '[^a-z0-9]', '', 'gi')) not like '%fuck%'
    and lower(regexp_replace(name, '[^a-z0-9]', '', 'gi')) not like '%shit%'
    and lower(regexp_replace(name, '[^a-z0-9]', '', 'gi')) not like '%bitch%'
    and lower(regexp_replace(name, '[^a-z0-9]', '', 'gi')) not like '%dick%'
    and lower(regexp_replace(name, '[^a-z0-9]', '', 'gi')) not like '%cock%'
    and lower(regexp_replace(name, '[^a-z0-9]', '', 'gi')) not like '%pussy%'
    and lower(regexp_replace(name, '[^a-z0-9]', '', 'gi')) not like '%slut%'
    and lower(regexp_replace(name, '[^a-z0-9]', '', 'gi')) not like '%whore%'
    and lower(regexp_replace(name, '[^a-z0-9]', '', 'gi')) not like '%nude%'
    and lower(regexp_replace(name, '[^a-z0-9]', '', 'gi')) not like '%naked%'
    and lower(regexp_replace(name, '[^a-z0-9]', '', 'gi')) not like '%porn%'
    and lower(regexp_replace(name, '[^a-z0-9]', '', 'gi')) not like '%hentai%'
    and lower(regexp_replace(name, '[^a-z0-9]', '', 'gi')) not like '%boobs%'
    and lower(regexp_replace(name, '[^a-z0-9]', '', 'gi')) not like '%tits%'
    and lower(regexp_replace(name, '[^a-z0-9]', '', 'gi')) not like '%cum%'
    and lower(regexp_replace(name, '[^a-z0-9]', '', 'gi')) not like '%anal%'
    and lower(regexp_replace(name, '[^a-z0-9]', '', 'gi')) not like '%penis%'
    and lower(regexp_replace(name, '[^a-z0-9]', '', 'gi')) not like '%vagina%'
    and lower(regexp_replace(name, '[^a-z0-9]', '', 'gi')) not like '%horny%'
    and lower(regexp_replace(name, '[^a-z0-9]', '', 'gi')) not like '%sexy%'
    and lower(regexp_replace(name, '[^a-z0-9]', '', 'gi')) not like '%xxx%';
$$;

create or replace function public.make_unique_gamename(base_name text)
returns citext
language plpgsql
as $$
declare
  candidate text;
begin
  candidate := left(regexp_replace(coalesce(base_name, 'PixelCreator'), '[^A-Za-z0-9 _.-]', '', 'g'), 18);

  if candidate is null or btrim(candidate) = '' or not public.is_allowed_gamename(candidate) then
    candidate := 'PixelCreator';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.gamename = candidate
  ) then
    return candidate::citext;
  end if;

  loop
    candidate := left(candidate, 13) || '_' || substr(encode(gen_random_bytes(2), 'hex'), 1, 4);
    exit when not exists (
      select 1
      from public.profiles p
      where p.gamename = candidate
    );
  end loop;

  return candidate::citext;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  gamename citext not null unique
    check (
      public.is_allowed_gamename(gamename::text)
    ),
  creator_level integer not null default 1 check (creator_level >= 1),
  xp integer not null default 0 check (xp >= 0),
  xp_max integer not null default 600 check (xp_max > 0),
  day_streak integer not null default 0 check (day_streak >= 0),
  last_streak_claim_on date,
  creation_count integer not null default 0 check (creation_count >= 0),
  challenge_count integer not null default 0 check (challenge_count >= 0),
  avatar_path text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row
execute function public.touch_updated_at();

alter table public.profiles
drop constraint if exists profiles_gamename_moderation_check;

alter table public.profiles
add constraint profiles_gamename_moderation_check
check (public.is_allowed_gamename(gamename::text));

create table if not exists public.app_settings (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  sound_effects boolean not null default true,
  push_notifications boolean not null default false,
  onboarding_complete boolean not null default false,
  last_active_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists app_settings_touch_updated_at on public.app_settings;
create trigger app_settings_touch_updated_at
before update on public.app_settings
for each row
execute function public.touch_updated_at();

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 64),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  canvas_size integer not null check (canvas_size in (16, 32, 64)),
  frame_count integer not null default 1 check (frame_count >= 1 and frame_count <= 240),
  frames jsonb not null default '[]'::jsonb,
  cover_frame jsonb,
  palette jsonb not null default '[]'::jsonb,
  template_id text,
  starter_key text,
  visibility text not null default 'private'
    check (visibility in ('private', 'unlisted', 'public')),
  is_gallery_item boolean not null default false,
  is_archived boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint projects_owner_slug_key unique (owner_id, slug)
);

create index if not exists projects_owner_updated_idx
  on public.projects (owner_id, updated_at desc);

create index if not exists projects_gallery_idx
  on public.projects (is_gallery_item, visibility, updated_at desc)
  where is_gallery_item = true and visibility = 'public';

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
before update on public.projects
for each row
execute function public.touch_updated_at();

create table if not exists public.project_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  asset_type text not null
    check (asset_type in ('thumbnail', 'png', 'gif', 'sprite-sheet', 'transparent-png')),
  bucket_path text not null unique,
  mime_type text not null,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  is_public boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists project_assets_project_idx
  on public.project_assets (project_id, asset_type);

drop trigger if exists project_assets_touch_updated_at on public.project_assets;
create trigger project_assets_touch_updated_at
before update on public.project_assets
for each row
execute function public.touch_updated_at();

create table if not exists public.challenge_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  challenge_key text not null,
  challenge_name text not null,
  starter_key text,
  score integer not null default 0,
  placement integer,
  submitted_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint challenge_entries_project_key unique (project_id, challenge_key)
);

create index if not exists challenge_entries_owner_submitted_idx
  on public.challenge_entries (owner_id, submitted_at desc);

create index if not exists challenge_entries_challenge_submitted_idx
  on public.challenge_entries (challenge_key, submitted_at desc);

drop trigger if exists challenge_entries_touch_updated_at on public.challenge_entries;
create trigger challenge_entries_touch_updated_at
before update on public.challenge_entries
for each row
execute function public.touch_updated_at();

create or replace function public.refresh_profile_counts(target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles p
  set creation_count = (
        select count(*)
        from public.projects pr
        where pr.owner_id = target_profile_id
          and pr.is_archived = false
      ),
      challenge_count = (
        select count(*)
        from public.challenge_entries ce
        where ce.owner_id = target_profile_id
      ),
      updated_at = timezone('utc', now())
  where p.id = target_profile_id;
end;
$$;

create or replace function public.refresh_profile_counts_from_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_profile_counts(coalesce(new.owner_id, old.owner_id));
  return coalesce(new, old);
end;
$$;

create or replace function public.refresh_profile_counts_from_challenge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_profile_counts(coalesce(new.owner_id, old.owner_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists projects_refresh_profile_counts on public.projects;
create trigger projects_refresh_profile_counts
after insert or update or delete on public.projects
for each row
execute function public.refresh_profile_counts_from_project();

drop trigger if exists challenge_entries_refresh_profile_counts on public.challenge_entries;
create trigger challenge_entries_refresh_profile_counts
after insert or update or delete on public.challenge_entries
for each row
execute function public.refresh_profile_counts_from_challenge();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_name text;
  clean_name text;
begin
  raw_name := coalesce(new.raw_user_meta_data ->> 'gamename', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), 'PixelCreator');
  clean_name := public.make_unique_gamename(raw_name)::text;

  insert into public.profiles (id, gamename)
  values (new.id, clean_name)
  on conflict (id) do nothing;

  insert into public.app_settings (profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create or replace function public.claim_daily_streak()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.profiles;
  next_streak integer;
begin
  select *
  into current_profile
  from public.profiles
  where id = auth.uid()
  for update;

  if current_profile.id is null then
    raise exception 'Profile not found for current user';
  end if;

  if current_profile.last_streak_claim_on = current_date then
    return current_profile;
  end if;

  next_streak := case
    when current_profile.last_streak_claim_on = current_date - 1 then current_profile.day_streak + 1
    else 1
  end;

  update public.profiles
  set day_streak = next_streak,
      last_streak_claim_on = current_date,
      updated_at = timezone('utc', now())
  where id = auth.uid()
  returning * into current_profile;

  return current_profile;
end;
$$;

alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.projects enable row level security;
alter table public.project_assets enable row level security;
alter table public.challenge_entries enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "app_settings_select_own" on public.app_settings;
create policy "app_settings_select_own"
on public.app_settings
for select
using (auth.uid() = profile_id);

drop policy if exists "app_settings_insert_own" on public.app_settings;
create policy "app_settings_insert_own"
on public.app_settings
for insert
with check (auth.uid() = profile_id);

drop policy if exists "app_settings_update_own" on public.app_settings;
create policy "app_settings_update_own"
on public.app_settings
for update
using (auth.uid() = profile_id)
with check (auth.uid() = profile_id);

drop policy if exists "projects_select_own_or_public" on public.projects;
create policy "projects_select_own_or_public"
on public.projects
for select
using (auth.uid() = owner_id or (visibility = 'public' and is_gallery_item = true and is_archived = false));

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own"
on public.projects
for insert
with check (auth.uid() = owner_id);

drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own"
on public.projects
for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own"
on public.projects
for delete
using (auth.uid() = owner_id);

drop policy if exists "project_assets_select_own_or_public" on public.project_assets;
create policy "project_assets_select_own_or_public"
on public.project_assets
for select
using (
  auth.uid() = owner_id
  or (
    is_public = true
    and exists (
      select 1
      from public.projects p
      where p.id = project_assets.project_id
        and p.visibility = 'public'
        and p.is_gallery_item = true
    )
  )
);

drop policy if exists "project_assets_insert_own" on public.project_assets;
create policy "project_assets_insert_own"
on public.project_assets
for insert
with check (auth.uid() = owner_id);

drop policy if exists "project_assets_update_own" on public.project_assets;
create policy "project_assets_update_own"
on public.project_assets
for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "project_assets_delete_own" on public.project_assets;
create policy "project_assets_delete_own"
on public.project_assets
for delete
using (auth.uid() = owner_id);

drop policy if exists "challenge_entries_select_own_or_public" on public.challenge_entries;
create policy "challenge_entries_select_own_or_public"
on public.challenge_entries
for select
using (
  auth.uid() = owner_id
  or exists (
    select 1
    from public.projects p
    where p.id = challenge_entries.project_id
      and p.visibility = 'public'
      and p.is_gallery_item = true
  )
);

drop policy if exists "challenge_entries_insert_own" on public.challenge_entries;
create policy "challenge_entries_insert_own"
on public.challenge_entries
for insert
with check (auth.uid() = owner_id);

drop policy if exists "challenge_entries_update_own" on public.challenge_entries;
create policy "challenge_entries_update_own"
on public.challenge_entries
for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "challenge_entries_delete_own" on public.challenge_entries;
create policy "challenge_entries_delete_own"
on public.challenge_entries
for delete
using (auth.uid() = owner_id);
