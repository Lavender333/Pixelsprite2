-- =====================================================================
-- Pixel Sprite Vibe — Subscription entitlements
-- File: supabase/migrations/0002_subscription_entitlements.sql
--
-- Your schema already has profiles.account_tier / is_pro / pro_since.
-- The problem is the RLS policy "profiles_update_own":
--
--   create policy "profiles_update_own" on public.profiles
--     for update using (auth.uid() = id) with check (auth.uid() = id);
--
-- That lets any signed-in user run
--   supabase.from('profiles').update({ account_tier: 'pro', is_pro: true })
-- from the browser console and grant themselves a paid subscription.
-- Right now, your paywall is decorative.
--
-- This migration:
--   1. Adds an apple_subscriptions table to record what the App Store said.
--   2. Locks account_tier / is_pro / pro_since so clients cannot write them.
--   3. Adds sync_apple_entitlement() as the only path to change tier.
--   4. Adds a scheduled expiry sweep so lapsed subs actually drop to free.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Subscription records
-- ---------------------------------------------------------------------
create table if not exists public.apple_subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  profile_id              uuid not null references public.profiles (id) on delete cascade,
  product_id              text not null,
  original_transaction_id text,
  environment             text not null default 'Production'
                            check (environment in ('Production', 'Sandbox')),
  status                  text not null default 'active'
                            check (status in ('active', 'expired', 'revoked', 'grace')),
  purchased_at            timestamptz not null default timezone('utc', now()),
  expires_at              timestamptz,
  last_verified_at        timestamptz not null default timezone('utc', now()),
  -- true once a server-side check (Edge Function / App Store Server Notification)
  -- has confirmed this transaction with Apple. Client-reported rows are false.
  server_verified         boolean not null default false,
  created_at              timestamptz not null default timezone('utc', now()),
  updated_at              timestamptz not null default timezone('utc', now())
);

-- One row per Apple transaction. Lets us upsert on renewal.
create unique index if not exists apple_subscriptions_txn_key
  on public.apple_subscriptions (original_transaction_id)
  where original_transaction_id is not null;

create index if not exists apple_subscriptions_profile_idx
  on public.apple_subscriptions (profile_id, status, expires_at desc);

drop trigger if exists apple_subscriptions_touch_updated_at on public.apple_subscriptions;
create trigger apple_subscriptions_touch_updated_at
before update on public.apple_subscriptions
for each row
execute function public.touch_updated_at();


-- ---------------------------------------------------------------------
-- 2. Make tier columns unwritable by clients
--
-- Postgres RLS is row-level, not column-level, so a policy cannot say
-- "you may update gamename but not is_pro". A BEFORE UPDATE trigger can.
-- Anything running as the anon/authenticated role gets its changes to the
-- protected columns silently reverted to their previous values.
-- service_role and postgres (Edge Functions, SQL editor, security-definer
-- functions) pass through untouched.
-- ---------------------------------------------------------------------
create or replace function public.protect_billing_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('role', true) in ('service_role', 'postgres')
     or session_user in ('service_role', 'postgres') then
    return new;
  end if;

  new.account_tier := old.account_tier;
  new.is_pro       := old.is_pro;
  new.pro_since    := old.pro_since;
  return new;
end;
$$;

drop trigger if exists profiles_protect_billing_columns on public.profiles;
create trigger profiles_protect_billing_columns
before update on public.profiles
for each row
execute function public.protect_billing_columns();


-- ---------------------------------------------------------------------
-- 3. The only supported way to change a tier
--
-- Called from the app after StoreKit reports an entitlement. It is
-- security definer, so it bypasses the trigger above, but it can only
-- ever act on auth.uid() — a user cannot promote someone else.
--
-- HONEST CAVEAT: this still trusts the client's word about what StoreKit
-- returned. It stops casual tampering (the console one-liner above), not a
-- determined attacker. See section 5 for how to close that.
-- ---------------------------------------------------------------------
create or replace function public.sync_apple_entitlement(
  p_product_id              text,
  p_active                  boolean,
  p_expires_at              timestamptz default null,
  p_original_transaction_id text default null,
  p_environment             text default 'Production'
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_active then
    insert into public.apple_subscriptions (
      profile_id, product_id, original_transaction_id,
      environment, status, expires_at, last_verified_at
    )
    values (
      v_uid, p_product_id, p_original_transaction_id,
      coalesce(p_environment, 'Production'), 'active', p_expires_at,
      timezone('utc', now())
    )
    on conflict (original_transaction_id) where original_transaction_id is not null
    do update set
      status           = 'active',
      expires_at       = excluded.expires_at,
      product_id       = excluded.product_id,
      last_verified_at = timezone('utc', now());

    update public.profiles
    set account_tier = 'pro',
        is_pro       = true,
        pro_since    = coalesce(pro_since, timezone('utc', now())),
        updated_at   = timezone('utc', now())
    where id = v_uid
    returning * into v_profile;

  else
    update public.apple_subscriptions
    set status           = 'expired',
        last_verified_at = timezone('utc', now())
    where profile_id = v_uid
      and status = 'active';

    update public.profiles
    set account_tier = 'free',
        is_pro       = false,
        updated_at   = timezone('utc', now())
    where id = v_uid
    returning * into v_profile;
  end if;

  return v_profile;
end;
$$;

revoke all on function public.sync_apple_entitlement(text, boolean, timestamptz, text, text) from public;
grant execute on function public.sync_apple_entitlement(text, boolean, timestamptz, text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 4. Expiry sweep
--
-- StoreKit is the source of truth on device, but a user who never reopens
-- the app would otherwise stay 'pro' in the database forever. Run this on
-- a schedule (Supabase Dashboard -> Integrations -> Cron, hourly).
-- ---------------------------------------------------------------------
create or replace function public.expire_lapsed_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.apple_subscriptions
  set status = 'expired'
  where status = 'active'
    and expires_at is not null
    and expires_at < timezone('utc', now());

  with lapsed as (
    update public.profiles p
    set account_tier = 'free',
        is_pro       = false,
        updated_at   = timezone('utc', now())
    where p.is_pro = true
      and not exists (
        select 1
        from public.apple_subscriptions s
        where s.profile_id = p.id
          and s.status in ('active', 'grace')
      )
    returning 1
  )
  select count(*) into v_count from lapsed;

  return v_count;
end;
$$;

revoke all on function public.expire_lapsed_subscriptions() from public;
-- Intentionally NOT granted to authenticated. Cron runs it as service_role.


-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------
alter table public.apple_subscriptions enable row level security;

-- Read your own subscription. That's it.
drop policy if exists "apple_subscriptions_select_own" on public.apple_subscriptions;
create policy "apple_subscriptions_select_own"
on public.apple_subscriptions
for select
using (auth.uid() = profile_id);

-- No insert / update / delete policies at all. Writes go exclusively through
-- sync_apple_entitlement() (security definer) or the service_role key inside an
-- Edge Function. A client cannot forge a subscription row directly.
