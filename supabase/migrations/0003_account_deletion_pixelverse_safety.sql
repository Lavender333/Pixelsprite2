-- =====================================================================
-- Pixel Sprite Vibe — Account deletion and PixelVerse safety controls
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. In-app account deletion
--
-- Apple requires account-creating apps to provide in-app deletion.
-- This removes the current auth.users row. Existing foreign keys with
-- `on delete cascade` remove the profile, settings, projects, assets,
-- challenge entries, and subscription rows.
-- ---------------------------------------------------------------------
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  delete from auth.users
  where id = v_uid;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;


-- ---------------------------------------------------------------------
-- 2. PixelVerse reports and blocks
-- ---------------------------------------------------------------------
create table if not exists public.pixelverse_reports (
  id            uuid primary key default gen_random_uuid(),
  reporter_id   uuid references public.profiles (id) on delete set null,
  project_id    uuid references public.projects (id) on delete cascade,
  reported_owner_id uuid references public.profiles (id) on delete set null,
  reason        text not null default 'inappropriate'
                  check (char_length(trim(reason)) between 3 and 500),
  status        text not null default 'pending'
                  check (status in ('pending', 'reviewing', 'actioned', 'dismissed')),
  created_at    timestamptz not null default timezone('utc', now()),
  reviewed_at   timestamptz
);

create index if not exists pixelverse_reports_project_status_idx
  on public.pixelverse_reports (project_id, status, created_at desc);

create index if not exists pixelverse_reports_reporter_idx
  on public.pixelverse_reports (reporter_id, created_at desc);

create unique index if not exists pixelverse_reports_one_open_per_user_project
  on public.pixelverse_reports (reporter_id, project_id)
  where status in ('pending', 'reviewing');

create table if not exists public.pixelverse_user_blocks (
  blocker_id  uuid not null references public.profiles (id) on delete cascade,
  blocked_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default timezone('utc', now()),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists pixelverse_user_blocks_blocked_idx
  on public.pixelverse_user_blocks (blocked_id);

alter table public.pixelverse_reports enable row level security;
alter table public.pixelverse_user_blocks enable row level security;

drop policy if exists "pixelverse_reports_insert_own" on public.pixelverse_reports;
create policy "pixelverse_reports_insert_own"
on public.pixelverse_reports
for insert
with check (auth.uid() = reporter_id);

drop policy if exists "pixelverse_reports_select_own" on public.pixelverse_reports;
create policy "pixelverse_reports_select_own"
on public.pixelverse_reports
for select
using (auth.uid() = reporter_id);

drop policy if exists "pixelverse_user_blocks_select_own" on public.pixelverse_user_blocks;
create policy "pixelverse_user_blocks_select_own"
on public.pixelverse_user_blocks
for select
using (auth.uid() = blocker_id);

drop policy if exists "pixelverse_user_blocks_insert_own" on public.pixelverse_user_blocks;
create policy "pixelverse_user_blocks_insert_own"
on public.pixelverse_user_blocks
for insert
with check (auth.uid() = blocker_id);

drop policy if exists "pixelverse_user_blocks_delete_own" on public.pixelverse_user_blocks;
create policy "pixelverse_user_blocks_delete_own"
on public.pixelverse_user_blocks
for delete
using (auth.uid() = blocker_id);

-- Hide public projects that the current user has blocked, and hide projects
-- with an open/actioned report while they are being reviewed.
drop policy if exists "projects_select_own_or_public" on public.projects;
create policy "projects_select_own_or_public"
on public.projects
for select
using (
  auth.uid() = owner_id
  or (
    visibility = 'public'
    and is_gallery_item = true
    and is_archived = false
    and not exists (
      select 1
      from public.pixelverse_reports r
      where r.project_id = projects.id
        and r.status in ('pending', 'reviewing', 'actioned')
    )
    and (
      auth.uid() is null
      or not exists (
        select 1
        from public.pixelverse_user_blocks b
        where b.blocker_id = auth.uid()
          and b.blocked_id = projects.owner_id
      )
    )
  )
);

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
        and p.is_archived = false
    )
  )
);

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
      and p.is_archived = false
  )
);
