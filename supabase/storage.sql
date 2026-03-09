insert into storage.buckets (id, name, public)
values ('project-assets', 'project-assets', false)
on conflict (id) do nothing;

drop policy if exists "project_assets_public_read" on storage.objects;
create policy "project_assets_public_read"
on storage.objects
for select
using (
  bucket_id = 'project-assets'
  and exists (
    select 1
    from public.project_assets pa
    join public.projects p on p.id = pa.project_id
    where pa.bucket_path = storage.objects.name
      and pa.is_public = true
      and p.visibility = 'public'
      and p.is_gallery_item = true
  )
);

drop policy if exists "project_assets_owner_read" on storage.objects;
create policy "project_assets_owner_read"
on storage.objects
for select
using (
  bucket_id = 'project-assets'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "project_assets_owner_insert" on storage.objects;
create policy "project_assets_owner_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-assets'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "project_assets_owner_update" on storage.objects;
create policy "project_assets_owner_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'project-assets'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'project-assets'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "project_assets_owner_delete" on storage.objects;
create policy "project_assets_owner_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-assets'
  and auth.uid()::text = (storage.foldername(name))[1]
);
