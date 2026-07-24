-- =====================================================================
-- Pixel Sprite Vibe — Admin report review
-- =====================================================================

create table if not exists public.admin_users (
  email text primary key check (email = lower(trim(email))),
  created_at timestamptz not null default timezone('utc', now())
);

insert into public.admin_users (email)
values ('antoinetteqwilliams@gmail.com')
on conflict (email) do nothing;

alter table public.admin_users enable row level security;

create or replace function public.is_pixelverse_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users a
    where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_pixelverse_admin() from public;
grant execute on function public.is_pixelverse_admin() to authenticated;

drop policy if exists "admin_users_select_self_admin" on public.admin_users;
create policy "admin_users_select_self_admin"
on public.admin_users
for select
using (public.is_pixelverse_admin());

drop policy if exists "pixelverse_reports_select_admin" on public.pixelverse_reports;
create policy "pixelverse_reports_select_admin"
on public.pixelverse_reports
for select
using (public.is_pixelverse_admin());

drop policy if exists "pixelverse_reports_update_admin" on public.pixelverse_reports;
create policy "pixelverse_reports_update_admin"
on public.pixelverse_reports
for update
using (public.is_pixelverse_admin())
with check (public.is_pixelverse_admin());

drop policy if exists "projects_select_admin" on public.projects;
create policy "projects_select_admin"
on public.projects
for select
using (public.is_pixelverse_admin());

drop policy if exists "projects_update_admin" on public.projects;
create policy "projects_update_admin"
on public.projects
for update
using (public.is_pixelverse_admin())
with check (public.is_pixelverse_admin());
