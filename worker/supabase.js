const jsonHeaders = { "Content-Type": "application/json", "Accept": "application/json" };

function config(env) {
  const url = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const anon = env.SUPABASE_ANON_KEY;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    const error = new Error("Supabase server configuration is incomplete.");
    error.status = 503;
    throw error;
  }
  return { url, anon, service };
}

async function supabaseFetch(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    const error = new Error("Supabase is temporarily unavailable.");
    error.status = 503;
    throw error;
  }
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) {
    const error = new Error(response.status >= 500 ? "Supabase request failed." : "Supabase rejected the request.");
    error.status = response.status === 401 || response.status === 403 ? 401 : response.status >= 500 ? 503 : 502;
    throw error;
  }
  return data;
}

export async function verifySupabaseUser(request, env) {
  const { url, anon } = config(env);
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) {
    const error = new Error("Sign in is required.");
    error.status = 401;
    throw error;
  }
  const user = await supabaseFetch(`${url}/auth/v1/user`, {
    method: "GET",
    headers: { apikey: anon, Authorization: `Bearer ${match[1]}`, Accept: "application/json" }
  });
  if (!user || typeof user.id !== "string") {
    const error = new Error("Invalid authentication session.");
    error.status = 401;
    throw error;
  }
  return { id: user.id, email: typeof user.email === "string" ? user.email : null };
}

async function serviceRequest(env, path, options = {}) {
  const { url, service } = config(env);
  return supabaseFetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      ...jsonHeaders,
      Prefer: options.method === "POST" || options.method === "PATCH" ? "return=minimal" : "return=representation",
      ...(options.headers || {})
    }
  });
}

export async function saveInvoiceOwner(env, user, invoiceId, invoiceNumber) {
  if (!user?.id || !invoiceId) throw new Error("Cannot save invoice ownership without a user and invoice.");
  await serviceRequest(env, "payguard_invoice_owners?on_conflict=paypal_invoice_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{
      paypal_invoice_id: String(invoiceId),
      user_id: user.id,
      invoice_number: String(invoiceNumber || invoiceId).slice(0, 128)
    }])
  });
}

export async function ownsInvoice(env, user, invoiceId) {
  if (!user?.id || !invoiceId) return false;
  const rows = await serviceRequest(env,
    `payguard_invoice_owners?select=paypal_invoice_id&paypal_invoice_id=eq.${encodeURIComponent(String(invoiceId))}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
  return Array.isArray(rows) && rows.length === 1;
}

export async function listOwnedInvoiceIds(env, user) {
  if (!user?.id) return [];
  const rows = await serviceRequest(env,
    `payguard_invoice_owners?select=paypal_invoice_id&user_id=eq.${encodeURIComponent(user.id)}&limit=1000`);
  return Array.isArray(rows) ? rows.map(row => row.paypal_invoice_id).filter(id => typeof id === "string") : [];
}

export async function addUserActivity(env, user, eventType, message) {
  if (!user?.id) throw new Error("Cannot record activity without an authenticated user.");
  await serviceRequest(env, "payguard_user_activity", {
    method: "POST",
    body: JSON.stringify([{
      user_id: user.id,
      event_type: String(eventType).slice(0, 40),
      message: String(message).slice(0, 240)
    }])
  });
}

export async function getUserActivity(env, user) {
  if (!user?.id) return [];
  const rows = await serviceRequest(env,
    `payguard_user_activity?select=id,event_type,message,created_at&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=30`);
  return Array.isArray(rows) ? rows.map(row => ({
    at: row.created_at,
    type: row.event_type,
    text: row.message
  })) : [];
}
