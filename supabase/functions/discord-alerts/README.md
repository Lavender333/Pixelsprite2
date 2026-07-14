# Discord Alerts

This Edge Function receives Supabase webhook events and posts owner alerts to Discord.

## Secrets

Set these in Supabase Dashboard -> Edge Functions -> Secrets:

- `DISCORD_SIGNUP_WEBHOOK_URL`: Discord webhook URL for signup alerts.
- `DISCORD_REPORT_WEBHOOK_URL`: optional Discord webhook URL for PixelVerse reports. If omitted, reports use the signup webhook.

Do not commit webhook URLs to the repo.

## Webhooks

In Supabase Dashboard -> Database -> Webhooks, add:

1. Signup alert
   - Table: `auth.users` on `INSERT` if available in your dashboard.
   - Fallback table: `public.profiles` on `INSERT`.
   - Method: `POST`
   - URL: the deployed `discord-alerts` Edge Function URL.

2. PixelVerse report alert
   - Table: `public.pixelverse_reports` on `INSERT`.
   - Method: `POST`
   - URL: the deployed `discord-alerts` Edge Function URL.

The function accepts Supabase webhook payloads with a `table` and `record`.
