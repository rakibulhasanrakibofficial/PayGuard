// Pure, dependency-free logic shared by the Cloudflare Worker and the Node adapter.
// Kept separate from I/O so it can be unit-tested with `node --test`.

export const SIGNALS = [
  ["overpaid", "Overpayment claims can lead to refund scams."],
  ["refund the difference", "A request to refund alleged excess money is a common scam pattern."],
  ["send back the difference", "Do not send money back before confirming the original payment in PayPal."],
  ["payment screenshot", "Screenshots can be edited and do not prove a payment arrived."],
  ["release the funds", "A demand to release work before verified payment is risky."],
  ["verification fee", "Unexpected fees to unlock or verify payments are suspicious."],
  ["gift card", "Gift cards are not a safe way to receive or refund client payments."],
  ["urgent", "Urgency can pressure you into skipping verification."],
  ["another account", "Requests to move payment or refunds to another account need independent verification."],
  ["crypto", "Requests to settle an invoice through unexpected crypto transfers are high risk."],
  ["western union", "Wire services like Western Union are a favourite route for payment scams."],
  ["my agent", "A third-party 'agent' handling payment or shipping is a common scam setup."]
];

export function ruleBasedAnalysis(message) {
  const normalized = String(message).toLowerCase();
  const findings = SIGNALS.filter(([term]) => normalized.includes(term)).map(([, reason]) => reason);
  const score = Math.min(100, findings.length * 22 + (findings.length ? 8 : 0));
  return {
    riskLevel: score >= 60 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW",
    riskScore: score,
    findings,
    recommendation: findings.length
      ? "Pause. Do not refund, ship goods, or begin extra work based on this message. Sign in to PayPal independently and verify the transaction."
      : "No listed warning pattern was detected. That does not prove the message is safe; verify every payment independently.",
    verificationStatus: "NOT_VERIFIED",
    analysisMode: "RULE_BASED",
    disclaimer: "Risk analysis is not a fraud verdict and never confirms payment. Only authenticated PayPal records can verify a PayPal transaction."
  };
}

const num = (s) => Number.parseFloat(String(s).replace(/,/g, ""));

// What does the message *claim*? These claims are later checked against PayPal.
export function extractClaims(message) {
  const text = String(message);
  const paid = text.match(/\b(?:paid|sent|transferred|wired|deposited)\b[^.\d$€£]{0,25}[$€£]?\s?(\d[\d,]*(?:\.\d+)?)/i);
  return {
    claimsPaid: /\b(?:i|we)(?:'ve| have| already| just)?\s+(?:paid|sent|transferred|wired|deposited)\b|\bpayment\s+(?:is\s+)?(?:done|complete|completed|sent|made)\b|\bhas been paid\b/i.test(text),
    claimedAmount: paid ? num(paid[1]) : null,
    asksRefund: /\brefund\b|send back|return the (?:difference|extra|balance)|overpa(?:id|yment)|extra (?:amount|money)/i.test(text),
    invoiceRef: (text.match(/\bINV2?-[A-Z0-9-]+/i) || [null])[0]
  };
}

const RANK = { LOW: 0, MEDIUM: 1, HIGH: 2 };

// PayPal is the source of truth. Message claims can only raise risk or be confirmed, never excused by AI.
export function applyVerification(analysis, claims, invoice) {
  const out = { ...analysis, findings: [...analysis.findings] };
  const raise = (level, score) => {
    if (RANK[level] > RANK[out.riskLevel]) out.riskLevel = level;
    out.riskScore = Math.max(out.riskScore, score);
  };
  if (!invoice) {
    out.verification = { status: "NOT_CHECKED", note: "No invoice was selected or matched, so no payment could be checked against PayPal." };
    if (claims.claimsPaid) {
      raise("MEDIUM", 45);
      out.findings.unshift("The message claims a payment was sent, but no PayPal invoice was selected to verify it.");
      out.recommendation = "Select the related invoice and check again, or open PayPal directly. Do not treat the message as proof of payment.";
    }
    return out;
  }
  const v = { invoiceNumber: invoice.number, invoiceId: invoice.id, status: invoice.status, total: invoice.total, paid: invoice.paid, currency: invoice.currency };
  out.verification = v;
  if (claims.claimsPaid && invoice.paid <= 0) {
    raise("HIGH", 92);
    v.result = "PAYMENT_NOT_FOUND";
    out.verificationStatus = "PAYMENT_NOT_FOUND";
    out.findings.unshift(`The client says they paid${claims.claimedAmount ? " " + claims.claimedAmount : ""}, but PayPal shows 0.00 paid on ${invoice.number}.`);
    out.recommendation = "Do not refund money, ship goods or deliver final work. PayPal has no payment on this invoice.";
  } else if (claims.claimsPaid && claims.claimedAmount && invoice.paid < claims.claimedAmount) {
    raise("HIGH", 85);
    v.result = "AMOUNT_MISMATCH";
    out.verificationStatus = "AMOUNT_MISMATCH";
    out.findings.unshift(`The client claims ${claims.claimedAmount}, but PayPal shows only ${invoice.paid.toFixed(2)} paid on ${invoice.number}.`);
    out.recommendation = "Do not refund anything. Only the amount PayPal shows has actually arrived.";
  } else if (claims.asksRefund && invoice.paid <= invoice.total) {
    raise("HIGH", 88);
    v.result = "NO_OVERPAYMENT";
    out.verificationStatus = "NO_OVERPAYMENT";
    out.findings.unshift(`A refund is requested, but PayPal shows no overpayment on ${invoice.number}.`);
    out.recommendation = "Do not send any money back. There is no excess payment to return.";
  } else if (claims.asksRefund && invoice.paid > invoice.total) {
    raise("MEDIUM", 50);
    v.result = "OVERPAYMENT_CONFIRMED";
    out.verificationStatus = "OVERPAYMENT_CONFIRMED";
    out.recommendation = "PayPal does show an overpayment. Refund only through PayPal's own refund option for that payment, never by a separate transfer.";
  } else if (invoice.total > 0 && invoice.paid >= invoice.total) {
    v.result = "PAYMENT_CONFIRMED";
    out.verificationStatus = "PAYMENT_CONFIRMED";
  } else {
    v.result = "UNPAID_OR_PARTIAL";
    out.verificationStatus = "NOT_VERIFIED";
  }
  return out;
}

export function normalizeInvoice(inv) {
  const r = inv.primary_recipients?.[0]?.billing_info || {};
  const name = [r.name?.given_name, r.name?.surname].filter(Boolean).join(" ");
  const total = num(inv.amount?.value) || 0;
  const paid = num(inv.payments?.paid_amount?.value) || 0;
  return {
    id: inv.id,
    number: inv.detail?.invoice_number || inv.id,
    status: inv.status || "UNKNOWN",
    client: name || r.email_address || "Unknown",
    email: r.email_address || "",
    currency: inv.detail?.currency_code || "USD",
    total,
    paid,
    due: inv.due_amount?.value != null ? num(inv.due_amount.value) : Math.max(total - paid, 0),
    dueDate: inv.detail?.payment_term?.due_date || null,
    created: inv.detail?.invoice_date || null,
    link: inv.detail?.metadata?.recipient_view_url || null,
    // Preserved (raw objects) so capture extraction also works on normalized
    // invoices; see extractCaptures. Same source the paid total came from.
    transactions: Array.isArray(inv.payments?.transactions) ? inv.payments.transactions : []
  };
}

// PayPal invoice payments live under `payments.transactions` on the raw
// invoice (the same `payments` object normalizeInvoice reads `paid_amount`
// from above); normalized invoices carry them as `transactions`. Individual
// transactions name their kind in `transaction_type` and their id in
// `transaction_id` (some shapes use an explicit `capture_id` instead).
// Only CAPTURE transactions are captures: refunds, sales recorded as other
// types, adjustments etc. must never be reported as a verified capture.
const CAPTURE_TYPES = new Set(["CAPTURE", "PAYMENT_CAPTURE"]);

export function extractCaptures(invoice) {
  if (!invoice || typeof invoice !== "object") return [];
  const transactions = Array.isArray(invoice.payments?.transactions)
    ? invoice.payments.transactions
    : Array.isArray(invoice.transactions) ? invoice.transactions : [];
  const invoiceId = invoice.id || invoice.invoiceId || null;
  const invoiceCurrency = invoice.detail?.currency_code || invoice.currency || null;
  const seen = new Set();
  const captures = [];
  for (const tx of transactions) {
    if (!tx || typeof tx !== "object") continue;
    const type = String(tx.transaction_type || tx.type || "").toUpperCase();
    // A transaction that declares a non-capture type is never a capture,
    // even if it happens to reference a capture id (e.g. a refund of one).
    if (type && !CAPTURE_TYPES.has(type)) continue;
    // With no declared type, only an explicit capture id proves a capture;
    // a bare transaction_id could be any kind of transaction.
    const captureId = tx.capture_id || tx.captureId || (type ? (tx.transaction_id || tx.id) : null);
    if (typeof captureId !== "string" || !captureId || seen.has(captureId)) continue;
    seen.add(captureId);
    captures.push({
      captureId,
      invoiceId,
      status: tx.status != null ? String(tx.status) : null,
      amount: {
        value: tx.amount?.value != null ? String(tx.amount.value) : null,
        currency_code: tx.amount?.currency_code || invoiceCurrency
      },
      date: tx.payment_date || tx.transaction_date || tx.create_time || tx.date || null
    });
  }
  return captures;
}

// Searches only the invoices it is given. Callers pass the *caller's own*
// invoices, so a capture belonging to someone else is simply "not found" —
// this never probes PayPal (or another user's invoices) with an arbitrary id.
export function findCaptureInInvoices(invoices, captureId) {
  if (!Array.isArray(invoices) || typeof captureId !== "string" || !captureId.trim()) return null;
  const target = captureId.trim();
  for (const invoice of invoices) {
    const match = extractCaptures(invoice).find((capture) => capture.captureId === target);
    if (match) return match;
  }
  return null;
}

export const isPaid = (inv) => ["PAID", "MARKED_AS_PAID"].includes(inv.status) && inv.total > 0 && inv.paid >= inv.total;

// Fallback so invoice drafting still works without an AI key.
export function parseJobText(text) {
  const t = String(text);
  const email = (t.match(/[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>(),;]+/) || [null])[0];
  const symbol = (t.match(/[$€£]/) || ["$"])[0];
  const currency = { "$": "USD", "€": "EUR", "£": "GBP" }[symbol];
  const hours = (t.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i) || [])[1];
  const rate = (t.match(/[$€£]\s?(\d+(?:\.\d+)?)\s*(?:\/\s*(?:hr|hour|h)\b|per\s+hour|an\s+hour)/i) || [])[1];
  const flat = (t.match(/[$€£]\s?(\d[\d,]*(?:\.\d+)?)/) || [])[1];
  const dueDays = Number((t.match(/due\s+in\s+(\d+)\s+days?/i) || [])[1]) || 7;
  const name = (t.match(/\b(?:[Ii]nvoice|[Bb]ill)\s+([A-Z][\w'’-]*(?:\s+[A-Z][\w'’-]*)?)/) || [])[1] || "";
  const desc = (t.match(/\bfor\s+(?:\d+(?:\.\d+)?\s*(?:hours?|hrs?)\s+(?:of\s+)?)?([^,.$€£(]+?)(?=\s+(?:at|@|due)\b|[,.($€£]|$)/i) || [])[1];
  let amount = null;
  let description = (desc || "").trim() || "Freelance work";
  if (hours && rate) {
    amount = Math.round(Number(hours) * Number(rate) * 100) / 100;
    description = `${description} (${hours} h x ${rate})`;
  } else if (flat) amount = num(flat);
  const missing = [];
  if (!email) missing.push("recipientEmail");
  if (!amount) missing.push("amount");
  return { recipientName: name, recipientEmail: email || "", description: description.slice(0, 120), amount, currency, dueDays: Math.min(Math.max(dueDays, 1), 90), missing };
}

export function reminderTemplate(inv, daysOverdue) {
  const late = daysOverdue > 0;
  const first = String(inv.client || "there").split(" ")[0];
  return {
    subject: `${late ? "Overdue" : "Reminder"}: invoice ${inv.number}`,
    note: `Hi ${first}, ${late ? `invoice ${inv.number} for ${inv.due.toFixed(2)} ${inv.currency} was due on ${inv.dueDate}` : `a friendly note that invoice ${inv.number} for ${inv.due.toFixed(2)} ${inv.currency} is due on ${inv.dueDate || "the agreed date"}`}. Please let me know if you have any questions. Thank you`.slice(0, 900)
  };
}
