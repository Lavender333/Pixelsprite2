# Security notes for Pixel Creator

Pixel Creator is a public static web app backed by Supabase Auth, Postgres, and Storage.

This document describes the security model that makes sense for this stack today.

## Security model

### Browser trust boundary

The browser is treated as untrusted.

The frontend may:
- authenticate users with Supabase Auth
- read and write only through the public Supabase client
- use the public anon key

The frontend must not:
- hold the Supabase `service_role` key
- decide ownership or role-based authorization
- bypass database policies

### Authorization boundary

The real authorization boundary is PostgreSQL Row Level Security.

Ownership and access are enforced in [supabase/schema.sql](supabase/schema.sql) through:
- row level security on app tables
- per-user ownership checks using `auth.uid()`
- limited `SECURITY DEFINER` functions for privileged internal operations

Frontend values like `user_id`, `owner_id`, or role flags are not trusted on their own.

### Current hardening in this repo

Implemented:
- Supabase Auth for account identity
- RLS on `profiles`, `app_settings`, `projects`, `project_assets`, and `challenge_entries`
- profile creation via trigger on new auth users
- gamename validation and moderation in both client code and database constraints
- static hosting security headers in [netlify.toml](netlify.toml) and [vercel.json](vercel.json)

## Hosting security headers

This app sends security headers suitable for a static Supabase-connected frontend, including:
- `Content-Security-Policy`
- `Strict-Transport-Security`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy`

## Important architectural notes

### Why the CSP still allows inline scripts

The current HTML uses:
- inline event handlers like `onclick`
- a small inline startup script in [index.html](index.html)

Because of that, the current CSP includes `'unsafe-inline'` for scripts.

This is a practical compromise for the current app, not the final ideal state.

### Next security hardening step

To tighten CSP further, refactor the frontend to:
- remove inline event handlers from [index.html](index.html)
- move the inline startup script into [script.js](script.js)
- then remove `'unsafe-inline'` from `script-src`

That would be the next meaningful security upgrade for this codebase.

## Supabase rules

For this app:
- browser uses anon key only
- `service_role` is never shipped to the client
- any future admin or moderation workflows should run through server-side or tightly scoped SQL functions

## Operational guidance

Recommended for production:
- separate Supabase projects for dev, staging, and production
- enable backups and test restore procedure periodically
- rotate secrets on a schedule
- review RLS policies whenever a new table or feature is added
- log privileged or moderation actions through append-only audit patterns

## Disclosure

If you find a security issue, report it privately to the project owner and avoid public disclosure until it is reviewed and fixed.
