const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ModerationResponse = {
  ok: boolean;
  status: 'approved' | 'blocked' | 'error';
  flagged?: boolean;
  categories?: Record<string, boolean>;
  category_scores?: Record<string, number>;
  reason?: string;
};

function json(body: ModerationResponse, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function combinedText(input: unknown) {
  if (!input || typeof input !== 'object') return '';
  const value = input as Record<string, unknown>;
  return [value.title, value.creator, value.category, value.theme]
    .filter((item) => typeof item === 'string' && item.trim())
    .join('\n')
    .slice(0, 2000);
}

function strongestUnsafeScore(scores: Record<string, number> = {}) {
  const strictCategories = [
    'sexual/minors',
    'sexual',
    'violence/graphic',
    'violence',
    'hate/threatening',
    'hate',
    'harassment/threatening',
    'self-harm/intent',
    'self-harm/instructions',
  ];
  return strictCategories.reduce((max, key) => Math.max(max, Number(scores[key] || 0)), 0);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ ok: false, status: 'error', reason: 'POST required' }, 405);
  }

  const openAIKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIKey) {
    return json({ ok: false, status: 'error', reason: 'Moderation key is not configured' }, 500);
  }

  const authorization = req.headers.get('authorization') || '';
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return json({ ok: false, status: 'error', reason: 'Signed-in user required' }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (_err) {
    return json({ ok: false, status: 'error', reason: 'Invalid request body' }, 400);
  }

  const image = typeof body.image === 'string' ? body.image : '';
  if (!image.startsWith('data:image/png;base64,')) {
    return json({ ok: false, status: 'error', reason: 'PNG image required' }, 400);
  }

  const text = combinedText(body.text);

  try {
    const moderation = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAIKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'omni-moderation-latest',
        input: [
          { type: 'text', text: text || 'PixelVerse creation' },
          { type: 'image_url', image_url: { url: image } },
        ],
      }),
    });

    const data = await moderation.json();
    if (!moderation.ok) {
      return json({ ok: false, status: 'error', reason: data?.error?.message || 'Moderation failed' }, 502);
    }

    const result = data?.results?.[0] || {};
    const flagged = !!result.flagged;
    const categories = result.categories || {};
    const categoryScores = result.category_scores || {};
    const strictScore = strongestUnsafeScore(categoryScores);
    const blocked = flagged || strictScore >= 0.35;

    return json({
      ok: !blocked,
      status: blocked ? 'blocked' : 'approved',
      flagged,
      categories,
      category_scores: categoryScores,
      reason: blocked ? 'Content did not pass PixelVerse safety checks' : 'Approved',
    });
  } catch (err) {
    console.error('[PixelVerse moderation]', err);
    return json({ ok: false, status: 'error', reason: 'Moderation unavailable' }, 502);
  }
});
