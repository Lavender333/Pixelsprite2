-- Send an owner alert whenever Supabase Auth creates a real user.
-- The publishable key is intentionally used here: it is already public in the
-- client app and only authorizes the request through the Edge Function gateway.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_discord_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := 'https://xqltgcxqlzchrnulomkv.supabase.co/functions/v1/discord-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_pNozt3QXGax9Uppt0-TFAw_9PbfZURE',
      'Authorization', 'Bearer sb_publishable_pNozt3QXGax9Uppt0-TFAw_9PbfZURE'
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'users',
      'record', jsonb_build_object(
        'id', new.id,
        'email', new.email,
        'raw_user_meta_data', coalesce(new.raw_user_meta_data, '{}'::jsonb),
        'created_at', new.created_at
      )
    )
  );
  return new;
exception
  when others then
    raise warning 'Discord signup alert could not be queued: %', sqlerrm;
    return new;
end;
$$;

revoke all on function public.notify_discord_new_user() from public;

drop trigger if exists on_auth_user_discord_alert on auth.users;
create trigger on_auth_user_discord_alert
after insert on auth.users
for each row
execute function public.notify_discord_new_user();
