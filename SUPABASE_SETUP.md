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
