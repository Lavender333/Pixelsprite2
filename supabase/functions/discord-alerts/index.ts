const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type WebhookEvent = {
  type?: string;
  table?: string;
  record?: Record<string, unknown>;
  old_record?: Record<string, unknown>;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function asText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function shortId(value: unknown) {
  const text = asText(value);
  return text ? `${text.slice(0, 8)}...` : 'unknown';
}

function isoNow() {
  return new Date().toISOString();
}

function signupMessage(record: Record<string, unknown>) {
  const email = asText(record.email, 'unknown email');
  const gamename = asText(record.gamename, asText(record.raw_user_meta_data && typeof record.raw_user_meta_data === 'object'
    ? (record.raw_user_meta_data as Record<string, unknown>).gamename
    : '', 'unknown gamename'));
  const createdAt = asText(record.created_at, isoNow());
  return {
    username: 'Pixel Sprite Alerts',
    embeds: [{
      title: 'New Pixel Sprite Vibe signup',
      color: 0x6c63ff,
      fields: [
        { name: 'Email', value: email, inline: false },
        { name: 'Gamename', value: gamename, inline: true },
        { name: 'User ID', value: shortId(record.id), inline: true },
        { name: 'Time', value: createdAt, inline: false },
      ],
      timestamp: isoNow(),
    }],
  };
}

function reportMessage(record: Record<string, unknown>) {
  return {
    username: 'Pixel Sprite Alerts',
    embeds: [{
      title: 'PixelVerse report received',
      color: 0xff6fa5,
      fields: [
        { name: 'Reason', value: asText(record.reason, 'No reason provided').slice(0, 500), inline: false },
        { name: 'Project', value: shortId(record.project_id), inline: true },
        { name: 'Reporter', value: shortId(record.reporter_id), inline: true },
        { name: 'Status', value: asText(record.status, 'pending'), inline: true },
        { name: 'Time', value: asText(record.created_at, isoNow()), inline: false },
      ],
      timestamp: isoNow(),
    }],
  };
}

function eventKind(event: WebhookEvent) {
  const table = asText(event.table).toLowerCase();
  if (table === 'profiles' || table === 'users') return 'signup';
  if (table === 'pixelverse_reports') return 'report';
  const record = event.record || {};
  if ('gamename' in record || 'email' in record) return 'signup';
  if ('reason' in record && 'project_id' in record) return 'report';
  return 'unknown';
}

async function postDiscord(webhookUrl: string, payload: Record<string, unknown>) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Discord webhook failed: ${response.status} ${text.slice(0, 200)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'POST required' }, 405);
  }

  let event: WebhookEvent;
  try {
    event = await req.json();
  } catch (_err) {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const record = event.record || {};
  const kind = eventKind(event);
  const signupWebhook = Deno.env.get('DISCORD_SIGNUP_WEBHOOK_URL');
  const reportWebhook = Deno.env.get('DISCORD_REPORT_WEBHOOK_URL') || signupWebhook;

  try {
    if (kind === 'signup') {
      if (!signupWebhook) return json({ ok: false, error: 'DISCORD_SIGNUP_WEBHOOK_URL is not configured' }, 500);
      await postDiscord(signupWebhook, signupMessage(record));
      return json({ ok: true, kind });
    }

    if (kind === 'report') {
      if (!reportWebhook) return json({ ok: false, error: 'Discord report webhook is not configured' }, 500);
      await postDiscord(reportWebhook, reportMessage(record));
      return json({ ok: true, kind });
    }

    return json({ ok: true, skipped: true, kind });
  } catch (err) {
    console.error('[Discord alerts]', err);
    return json({ ok: false, error: err instanceof Error ? err.message : 'Discord alert failed' }, 502);
  }
});
