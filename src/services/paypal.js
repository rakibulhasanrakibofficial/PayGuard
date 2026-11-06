const baseUrl = (process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com").replace(/\/$/, "");
let tokenCache = null;
let tokenExpiry = 0;

export async function getAccessToken() {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    const error = new Error("PayPal Sandbox credentials are missing. Configure your .env file.");
    error.status = 503;
    throw error;
  }
  if (tokenCache && Date.now() < tokenExpiry - 60_000) return tokenCache;
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error_description || "PayPal authentication failed.");
    error.status = response.status >= 500 ? 502 : response.status;
    throw error;
  }
  tokenCache = data.access_token;
  tokenExpiry = Date.now() + Number(data.expires_in || 300) * 1000;
  return tokenCache;
}

export async function paypalRequest(endpoint, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
  if (!response.ok) {
    const error = new Error(data.message || data.details?.[0]?.description || "PayPal API request failed.");
    error.status = response.status >= 500 ? 502 : response.status;
    throw error;
  }
  return data;
}

export async function createAndSendInvoice({ recipientEmail, recipientName, description, amount, currency }) {
  const invoice = await paypalRequest("/v2/invoicing/invoices", {
    method: "POST",
    body: JSON.stringify({
      detail: { currency_code: currency, note: "Created with PayGuard Sandbox. Test invoice only." },
      primary_recipients: [{ billing_info: { email_address: recipientEmail, name: { given_name: recipientName || "Customer" } } }],
      items: [{ name: description, quantity: "1", unit_amount: { currency_code: currency, value: Number(amount).toFixed(2) } }]
    })
  });
  if (!invoice.id) throw new Error("PayPal did not return an invoice ID.");
  const sent = await paypalRequest(`/v2/invoicing/invoices/${encodeURIComponent(invoice.id)}/send`, {
    method: "POST", body: JSON.stringify({ send_to_recipient: true, send_to_invoicer: false })
  });
  return { invoiceId: invoice.id, status: sent.status || "SENT", href: invoice.href || null };
}

export async function getCapture(captureId) {
  return paypalRequest(`/v2/payments/captures/${encodeURIComponent(captureId)}`, { method: "GET" });
}

export async function verifyWebhook(headers, event) {
  if (!process.env.PAYPAL_WEBHOOK_ID) {
    const error = new Error("PAYPAL_WEBHOOK_ID is not configured.");
    error.status = 503;
    throw error;
  }
  return paypalRequest("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: JSON.stringify({
      auth_algo: headers["paypal-auth-algo"], cert_url: headers["paypal-cert-url"],
      transmission_id: headers["paypal-transmission-id"], transmission_sig: headers["paypal-transmission-sig"],
      transmission_time: headers["paypal-transmission-time"], webhook_id: process.env.PAYPAL_WEBHOOK_ID,
      webhook_event: event
    })
  });
}
