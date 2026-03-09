# Supabase setup for Pixel Creator

This app is ready for Supabase as a next step, but it is still local-first today.

Current browser storage maps cleanly to Supabase like this:

- `pc2_profile_name` → `public.profiles.gamename`
- `pc2_streak` + `pc2_streak_claim_day` → `public.profiles.day_streak` + `last_streak_claim_on`
- `pc2_proj` → `public.projects`
- `pc2_challenge_submissions` → `public.challenge_entries`
- `pc2_sound_effects` → `public.app_settings.sound_effects`

## Tables included

The starter schema in [supabase/schema.sql](supabase/schema.sql) creates these core tables:

- `public.profiles` — gamename, creator level, XP, streak, counts
- `public.app_settings` — sound and future account preferences
- `public.projects` — saved drawings, frames JSON, gallery visibility
- `public.project_assets` — exported PNG/GIF/thumbnail file records
- `public.challenge_entries` — challenge submissions tied to projects

It also adds:

- `public.claim_daily_streak()` to safely update streaks once per day
- auto-created profile + settings rows when a new auth user is created
- row-level security policies for private saves and optional public gallery items

## Recommended Supabase project setup

1. Create a new Supabase project.
2. In **Authentication**, enable:
   - Email auth, or
   - Anonymous auth first if you want a no-signup flow
3. Open the SQL editor.
4. Paste in [supabase/schema.sql](supabase/schema.sql).
5. Run the script.
6. In **Storage**, create a private bucket named `project-assets`.
7. Add your app keys later in the frontend:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`

## Auth flow now added in the app

The profile screen now includes:

- email sign up
- email sign in
- sign out
- change email
- password reset email
- session persistence with Supabase Auth

The frontend is currently wired to:

- Project URL: `https://xqltgcxqlzchrnulomkv.supabase.co`
- Publishable key: the supplied public key in [script.js](script.js)
- Production auth redirect URL: `https://pixelspirite.com/`

Passwords are **not** stored by this app. They are handled by Supabase Auth only.

## Supabase dashboard auth settings

In Supabase, open **Authentication → URL Configuration** and add:

- Site URL: `https://pixelspirite.com/`
- Redirect URL: `https://pixelspirite.com/`
- Redirect URL: `http://localhost:3000/`
- Redirect URL: `http://127.0.0.1:5500/`

If you use a different local dev URL, add that too.

Important: the app now forces all auth emails to redirect to `https://pixelspirite.com/` instead of localhost. If your real production domain changes, update [script.js](script.js) and Supabase URL Configuration together.

## Email templates and delivery

In **Authentication → Email Templates** you can customize:

- Confirm signup
- Magic link / OTP if you enable it later
- Change email address
- Reset password

For production, connect a real email sender in Supabase so password resets and signup confirmations land reliably.

## Final connection checklist

To fully connect this app to your Supabase project, do these remaining steps:

1. Run [supabase/schema.sql](supabase/schema.sql) in the Supabase SQL editor.
2. Run [supabase/storage.sql](supabase/storage.sql) in the Supabase SQL editor.
3. In **Authentication → Providers**, turn on **Email**.
4. Decide whether to keep **Confirm email** on:
   - keep it **on** for stricter account verification
   - turn it **off** if you want instant sign-in right after signup
5. In **Authentication → URL Configuration**, add your production URL and local dev URLs.
6. In **Storage**, confirm the `project-assets` bucket exists.
7. In **Authentication → Email Templates / SMTP**, connect a real sender for:
   - signup confirmation
   - password reset
   - change email

## Important: what is connected vs not connected yet

Already connected in the app:

- email/password auth
- session persistence
- password reset emails
- cloud profile sync for gamename
- cloud sync for streak, XP, level, and sound setting
- full Closet project save/load from `public.projects`
- challenge submission sync from `public.challenge_entries`
- PNG / transparent PNG / GIF export upload into `project-assets`
- `public.project_assets` metadata rows for uploaded exports
- publish / private gallery controls on top of `visibility` and `is_gallery_item`

Not fully connected yet:

- optional public gallery browsing screen for other users
- optional thumbnail generation/upload for gallery cards

So Supabase auth, profile sync, project sync, challenge sync, export uploads, and gallery publishing are now wired.

## Recommended release hardening

Before launch, also do this:

- replace the hardcoded publishable key in [script.js](script.js) with a small config file or build-time env injection
- add custom SMTP in Supabase for reliable email delivery
- test signup, signin, signout, password reset, and change email on both web and iPhone
- verify your redirect URL matches the exact deployed domain

## Data model notes

### `profiles`
Use this for:
- gamename
- creator level
- XP / XP cap
- daily streak
- live counts shown on the Me page

### `projects`
This table stores the saved art itself.

The current app serializes frames as arrays, so the simplest migration is to keep them in `frames jsonb` first. That keeps the frontend rewrite small and matches how [script.js](script.js#L5682-L5690) already serializes projects.

Suggested mapping from the app:
- `name` → `title`
- `size` → `canvas_size`
- serialized `fd` → `frames`
- current save timestamp → `updated_at`

### `project_assets`
Use this after export/upload.

Example storage path convention:
- `user-id/project-id/thumb.png`
- `user-id/project-id/export.png`
- `user-id/project-id/export.gif`

Store the file metadata in `public.project_assets` and the binary file in the `project-assets` bucket.

### `challenge_entries`
Use this for gallery/challenge publishing without exposing every private project.

A challenge entry points to a project and adds:
- challenge id/name
- starter key
- submission time
- optional score / placement later

## Suggested implementation order

1. Add Supabase auth.
2. Save/load `profiles`.
3. Replace local `pc2_proj` saves with `projects`.
4. Call `claim_daily_streak()` when the user opens the app each day.
5. Upload exported PNG/GIF files to Storage and create `project_assets` rows.
6. Publish selected projects to the gallery by setting:
   - `visibility = 'public'`
   - `is_gallery_item = true`

## What this does not change yet

This repo does **not** yet include frontend Supabase wiring.

Right now this commit gives you:
- the table design
- security policies
- streak helper RPC
- a clean setup guide

The next coding step would be connecting [script.js](script.js) to Supabase auth and replacing the current `localStorage` save/load paths.
