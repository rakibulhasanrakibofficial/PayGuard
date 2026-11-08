const JSON_HEADERS = { "Content-Type": "application/json" };

function config(env) {
  const url = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const anon = String(env.SUPABASE_ANON_KEY || "");
  const service = String(env.SUPABASE_SERVICE_ROLE_KEY || "");
  if (!url || !anon || !service) {
    const error = new Error("Supabase is not configured. Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.");
    error.status = 503;
    throw error;
  }
  return { url, anon, service };
}

async function supabaseFetch(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) {
    const error = new Error(data?.msg || data?.message || data?.error_description || "Supabase request failed.");
    error.status = response.status === 401 || response.status === 403 ? 401 : 502;
    throw error;
  }
  return data;
}

export async function verifySupabaseUser(request, env) {
  const { url, anon } = config(env);
  const auth = request.headers.get("Authorization") || "";
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || token.length > 4096) {
    const error = new Error("Please sign in to continue.");
    error.status = 401;
    throw error;
  }
  const user = await supabaseFetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` }
  });
  if (!user?.id || !user.email) {
    const error = new Error("Your session is invalid. Please sign in again.");
    error.status = 401;
    throw error;
  }
  return { id: user.id, email: user.email };
}

function restHeaders(service, prefer = "return=minimal") {
  return {
    apikey: service,
    Authorization: `Bearer ${service}`,
    "Content-Type": "application/json",
    Prefer: prefer
  };
}

export async function saveInvoiceOwner(env, user, invoiceId, invoiceNumber) {
  const { url, service } = config(env);
  await supabaseFetch(`${url}/rest/v1/payguard_invoice_owners`, {
    method: "POST",
    headers: restHeaders(service, "resolution=merge-duplicates,return=minimal"),
    body: JSON.stringify({ paypal_invoice_id: invoiceId, user_id: user.id, invoice_number: invoiceNumber })
  });
}

export async function ownsInvoice(env, user, invoiceId) {
  const { url, service } = config(env);
  const rows = await supabaseFetch(`${url}/rest/v1/payguard_invoice_owners?select=paypal_invoice_id&paypal_invoice_id=eq.${encodeURIComponent(invoiceId)}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`, {
    headers: restHeaders(service)
  });
  return Array.isArray(rows) && rows.length === 1;
}

export async function listOwnedInvoiceIds(env, user) {
  const { url, service } = config(env);
  const rows = await supabaseFetch(`${url}/rest/v1/payguard_invoice_owners?select=paypal_invoice_id&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=100`, {
    headers: restHeaders(service)
  });
  return Array.isArray(rows) ? rows.map(row => row.paypal_invoice_id).filter(Boolean) : [];
}

export async function saveCaptureOwner(env, user, capture) {
  const { url, service } = config(env);
  await supabaseFetch(`${url}/rest/v1/payguard_capture_owners`, {
    method: "POST",
    headers: restHeaders(service, "resolution=merge-duplicates,return=minimal"),
    body: JSON.stringify({
      capture_id: capture.captureId,
      paypal_invoice_id: capture.invoiceId,
      user_id: user.id,
      amount_value: capture.amount?.value ?? null,
      currency_code: capture.amount?.currency_code ?? null,
      status: capture.status ?? null
    })
  });
}

export async function getCaptureOwner(env, captureId) {
  const { url, service } = config(env);
  const rows = await supabaseFetch(`${url}/rest/v1/payguard_capture_owners?select=capture_id,paypal_invoice_id,user_id,amount_value,currency_code,status,created_at&capture_id=eq.${encodeURIComponent(captureId)}&limit=1`, {
    headers: restHeaders(service)
  });
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

export async function addUserActivity(env, user, eventType, message) {
  const { url, service } = config(env);
  await supabaseFetch(`${url}/rest/v1/payguard_user_activity`, {
    method: "POST",
    headers: restHeaders(service),
    body: JSON.stringify({ user_id: user.id, event_type: eventType, message: String(message).slice(0, 500) })
  });
}

export async function getUserActivity(env, user) {
  const { url, service } = config(env);
  const rows = await supabaseFetch(`${url}/rest/v1/payguard_user_activity?select=event_type,message,created_at&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=30`, {
    headers: restHeaders(service)
  });
  return Array.isArray(rows) ? rows.map(row => ({ type: row.event_type, text: row.message, at: row.created_at })) : [];
}
