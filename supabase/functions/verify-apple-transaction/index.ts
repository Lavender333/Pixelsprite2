const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type AppleEnvironment = 'Production' | 'Sandbox';

type AppleTransactionPayload = {
  transactionId?: string;
  originalTransactionId?: string;
  bundleId?: string;
  productId?: string;
  expiresDate?: number;
  revocationDate?: number;
  environment?: AppleEnvironment;
  type?: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function requireEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function base64Url(bytes: Uint8Array | string) {
  const binary = typeof bytes === 'string'
    ? bytes
    : Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlJson(value: Record<string, unknown>) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function decodeBase64UrlJson<T>(value: string): T {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return JSON.parse(atob(padded)) as T;
}

function pemToPkcs8(privateKey: string) {
  const normalized = privateKey.replace(/\\n/g, '\n');
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function makeAppleJwt() {
  const issuerId = requireEnv('APP_STORE_ISSUER_ID');
  const keyId = requireEnv('APP_STORE_KEY_ID');
  const bundleId = requireEnv('APP_STORE_BUNDLE_ID');
  const privateKey = requireEnv('APP_STORE_PRIVATE_KEY');
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: 'ES256', kid: keyId, typ: 'JWT' });
  const payload = base64UrlJson({
    iss: issuerId,
    iat: now,
    exp: now + 20 * 60,
    aud: 'appstoreconnect-v1',
    bid: bundleId,
  });
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

async function appleTransactionInfo(transactionId: string, environment: AppleEnvironment, jwt: string) {
  const host = environment === 'Sandbox'
    ? 'https://api.storekit-sandbox.apple.com'
    : 'https://api.storekit.apple.com';
  const response = await fetch(`${host}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function verifiedApplePayload(transactionId: string) {
  const preferred = (Deno.env.get('APP_STORE_ENVIRONMENT') || 'Production').trim() === 'Sandbox'
    ? 'Sandbox'
    : 'Production';
  const environments: AppleEnvironment[] = preferred === 'Sandbox'
    ? ['Sandbox', 'Production']
    : ['Production', 'Sandbox'];
  const jwt = await makeAppleJwt();
  let lastError = '';

  for (const environment of environments) {
    const { response, data } = await appleTransactionInfo(transactionId, environment, jwt);
    if (response.ok && typeof data?.signedTransactionInfo === 'string') {
      const [, payload] = data.signedTransactionInfo.split('.');
      if (!payload) throw new Error('Apple returned an unreadable transaction payload');
      return decodeBase64UrlJson<AppleTransactionPayload>(payload);
    }
    lastError = `${environment}: ${response.status} ${JSON.stringify(data).slice(0, 300)}`;
    if (response.status !== 404) break;
  }

  throw new Error(`Apple transaction verification failed (${lastError})`);
}

async function currentUser(req: Request, supabaseUrl: string, anonKey: string) {
  const authorization = req.headers.get('authorization') || '';
  if (!authorization.toLowerCase().startsWith('bearer ')) throw new Error('Signed-in user required');
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization },
  });
  if (!response.ok) throw new Error('Signed-in user required');
  const user = await response.json();
  if (!user?.id) throw new Error('Signed-in user required');
  return user as { id: string };
}

async function supabaseFetch(path: string, init: RequestInit = {}) {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`Supabase write failed: ${response.status} ${text.slice(0, 300)}`);
  return data;
}

async function saveEntitlement(profileId: string, payload: AppleTransactionPayload) {
  const expectedBundle = requireEnv('APP_STORE_BUNDLE_ID');
  const expectedProduct = Deno.env.get('APP_STORE_PRODUCT_ID')?.trim() || 'Monthly';
  if (payload.bundleId !== expectedBundle) throw new Error('Apple transaction bundle ID does not match this app');
  if (payload.productId !== expectedProduct) throw new Error('Apple transaction product ID does not match Monthly');

  const expiresAt = payload.expiresDate ? new Date(payload.expiresDate).toISOString() : null;
  const revoked = !!payload.revocationDate;
  const expired = !!payload.expiresDate && payload.expiresDate <= Date.now();
  const active = !revoked && !expired;
  const status = active ? 'active' : revoked ? 'revoked' : 'expired';
  const originalTransactionId = payload.originalTransactionId || payload.transactionId;

  const record = {
    profile_id: profileId,
    product_id: payload.productId,
    original_transaction_id: originalTransactionId,
    environment: payload.environment || 'Production',
    status,
    expires_at: expiresAt,
    last_verified_at: new Date().toISOString(),
    server_verified: true,
  };

  if (originalTransactionId) {
    const existing = await supabaseFetch(
      `apple_subscriptions?select=id&original_transaction_id=eq.${encodeURIComponent(originalTransactionId)}&limit=1`,
    );
    if (Array.isArray(existing) && existing[0]?.id) {
      await supabaseFetch(`apple_subscriptions?id=eq.${encodeURIComponent(existing[0].id)}`, {
        method: 'PATCH',
        body: JSON.stringify(record),
      });
    } else {
      await supabaseFetch('apple_subscriptions', {
        method: 'POST',
        body: JSON.stringify(record),
      });
    }
  }

  await supabaseFetch(`profiles?id=eq.${encodeURIComponent(profileId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      account_tier: active ? 'pro' : 'free',
      is_pro: active,
      pro_since: active ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }),
  });

  return { active, status, expiresAt, productId: payload.productId, environment: payload.environment };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST required' }, 405);

  try {
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const anonKey = requireEnv('SUPABASE_ANON_KEY');
    const user = await currentUser(req, supabaseUrl, anonKey);
    const body = await req.json().catch(() => ({}));
    const transactionId = typeof body.transactionId === 'string' ? body.transactionId.trim() : '';
    if (!transactionId) return json({ ok: false, error: 'transactionId is required' }, 400);

    const applePayload = await verifiedApplePayload(transactionId);
    const entitlement = await saveEntitlement(user.id, applePayload);
    return json({ ok: true, entitlement });
  } catch (err) {
    console.error('[verify-apple-transaction]', err);
    return json({ ok: false, error: err instanceof Error ? err.message : 'Verification failed' }, 400);
  }
});
