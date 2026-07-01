# Supabase setup for Pixel Sprite Vibe

This app is ready for Supabase as a next step, but it is still local-first today.

Current browser storage maps cleanly to Supabase like this:

- `pc2_profile_name` → `public.profiles.gamename`
- `pc2_account_tier` + `pc2_pro_since` → `public.profiles.account_tier` + `pro_since`
- `pc2_streak` + `pc2_streak_claim_day` → `public.profiles.day_streak` + `last_streak_claim_on`
- `pc2_proj` → `public.projects`
- `pc2_challenge_submissions` → `public.challenge_entries`
- `pc2_sound_effects` → `public.app_settings.sound_effects`

## Tables included

The starter schema in [supabase/schema.sql](supabase/schema.sql) creates these core tables:

- `public.profiles` — gamename, Free/Club account status, creator level, XP, streak, counts
- `public.app_settings` — sound and future account preferences
- `public.projects` — saved drawings, frames JSON, gallery visibility
- `public.project_assets` — exported PNG/GIF/thumbnail file records
- `public.challenge_entries` — challenge submissions tied to projects

It also adds:

- `public.claim_daily_streak()` to safely update streaks once per day
- auto-created profile + settings rows when a new auth user is created
- unique gamename enforcement plus profanity / lewd-name filtering in `public.profiles`
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
8. Deploy the PixelVerse image moderation function and add your private OpenAI key:
   - `supabase functions deploy moderate-pixelverse`
   - `supabase secrets set OPENAI_API_KEY=sk-your-private-key`

Important: never put the private OpenAI key in [script.js](script.js), Xcode, or any public app file. It belongs only in Supabase secrets.

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
3. In **Authentication → Providers**, turn on **Apple**, **Google**, and **Email**.
   - Make **Apple** the primary iOS sign-in option. It supports Hide My Email and avoids password friction for families.
   - Use **Google** for Android, Chromebook, and web families.
   - Keep **Email** as the fallback option, not the primary button.
   - Supabase callback URL for both OAuth providers: `https://xqltgcxqlzchrnulomkv.supabase.co/auth/v1/callback`
   - Google needs an OAuth client ID and client secret from Google Cloud Console.
   - Apple needs a Services ID, Team ID, Key ID, and private key from Apple Developer.
4. In **Authentication → URL Configuration**, add `https://pixelspirite.com/` as an allowed redirect URL. Keep the local dev URLs only for testing.
5. Decide whether to keep **Confirm email** on:
   - keep it **on** for stricter account verification
   - turn it **off** if you want instant sign-in right after signup
6. In **Storage**, confirm the `project-assets` bucket exists.
7. In **Authentication → Email Templates / SMTP**, connect a real sender for:
   - signup confirmation
   - password reset
   - change email

The app is configured to persist sessions and refresh tokens automatically, so users should stay signed in until they explicitly sign out.

If you already ran the schema before the gamename moderation update, run [supabase/schema.sql](supabase/schema.sql) again so the new username safety checks are added to your existing project.

## Important: what is connected vs not connected yet

Already connected in the app:

- email/password auth
- Free vs Club account status on the profile record
- session persistence
- password reset emails
- cloud profile sync for gamename
- cloud sync for streak, XP, level, and sound setting
- full Closet project save/load from `public.projects`
- challenge submission sync from `public.challenge_entries`
- PNG / transparent PNG / GIF export upload into `project-assets`
- `public.project_assets` metadata rows for uploaded exports
- publish / private gallery controls on top of `visibility` and `is_gallery_item`
- real PixelVerse publish moderation through the `moderate-pixelverse` Supabase Edge Function, using OpenAI image moderation on the server side

Not fully connected yet:

- Apple In-App Purchase receipt validation for turning a Free account into Club
- optional thumbnail generation/upload for gallery cards

## PixelVerse image moderation

The app now checks creations twice before public publishing:

1. Local safety checks block blank art, unsafe names, and personal information.
2. The Supabase Edge Function at [supabase/functions/moderate-pixelverse/index.ts](supabase/functions/moderate-pixelverse/index.ts) sends a PNG preview to OpenAI's moderation API with the `omni-moderation-latest` model.

If the moderation function is missing, down, or unsure, the app keeps the creation private. This is intentional for child safety.

To turn it on in production:

```bash
supabase functions deploy moderate-pixelverse
supabase secrets set OPENAI_API_KEY=sk-your-private-key
```

Then test by signing in, saving a drawing, and tapping **Share to PixelVerse**. A safe image should publish; unsafe or unchecked images should stay private.

For paid upgrades, create and submit the In-App Purchase products in App Store Connect first: Monthly `$1.99` and Annual `$19.99` as auto-renewable subscriptions, plus Forever Access `$29.99` as a Non-Consumable In-App Purchase. Then add receipt validation before setting `account_tier = 'pro'`. The database can keep using `pro` internally while the app shows the customer-facing name "Premium Features". Do not use Stripe, PayPal, Cash App, or another outside checkout for digital premium features inside the iOS app.

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
- account tier: `account_tier` is `free` or `pro`
- paid status: `is_pro` and optional `pro_since`
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
