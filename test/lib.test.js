import test from "node:test";
import assert from "node:assert/strict";
import { ruleBasedAnalysis, extractClaims, applyVerification, parseJobText, normalizeInvoice, isPaid, reminderTemplate, extractCaptures, findCaptureInInvoices } from "../worker/lib.js";

test("flags overpayment and refund pressure as high risk", () => {
  const r = ruleBasedAnalysis("I overpaid you. Refund the difference urgently with a payment screenshot.");
  assert.equal(r.riskLevel, "HIGH");
  assert.equal(r.verificationStatus, "NOT_VERIFIED");
});
test("ordinary work message stays low risk", () => {
  assert.equal(ruleBasedAnalysis("Hello, can you send me the draft tomorrow?").riskLevel, "LOW");
});

const claimMsg = "Hi, I sent $500 for INV2-0001 by mistake. Please send back the $300 difference.";
const invoice = (over = {}) => ({ id: "INV2-AAAA-BBBB", number: "0001", status: "SENT", total: 200, paid: 0, currency: "USD", ...over });

test("extracts payment claim, amount, refund request and invoice reference", () => {
  const c = extractClaims(claimMsg);
  assert.equal(c.claimsPaid, true);
  assert.equal(c.claimedAmount, 500);
  assert.equal(c.asksRefund, true);
  assert.equal(c.invoiceRef, "INV2-0001");
});
test("PayPal shows nothing paid: claim is escalated to HIGH", () => {
  const out = applyVerification(ruleBasedAnalysis(claimMsg), extractClaims(claimMsg), invoice());
  assert.equal(out.riskLevel, "HIGH");
  assert.equal(out.verificationStatus, "PAYMENT_NOT_FOUND");
  assert.match(out.recommendation, /Do not refund/);
});
test("refund requested but PayPal shows no overpayment is HIGH", () => {
  const msg = "Please refund the extra money, thanks.";
  const out = applyVerification(ruleBasedAnalysis(msg), extractClaims(msg), invoice({ paid: 200, status: "PAID" }));
  assert.equal(out.verificationStatus, "NO_OVERPAYMENT");
  assert.equal(out.riskLevel, "HIGH");
});
test("real overpayment is confirmed but never auto-approved", () => {
  const msg = "I overpaid, please refund the extra.";
  const out = applyVerification(ruleBasedAnalysis(msg), extractClaims(msg), invoice({ paid: 500, status: "PAID" }));
  assert.equal(out.verificationStatus, "OVERPAYMENT_CONFIRMED");
  assert.match(out.recommendation, /PayPal's own refund/);
});
test("a confirmed payment with a normal message stays low risk", () => {
  const msg = "Hi, I have paid the invoice. Thanks!";
  const out = applyVerification(ruleBasedAnalysis(msg), extractClaims(msg), invoice({ paid: 200, status: "PAID" }));
  assert.equal(out.verificationStatus, "PAYMENT_CONFIRMED");
  assert.equal(out.riskLevel, "LOW");
});
test("payment claim with no invoice selected is at least MEDIUM", () => {
  const out = applyVerification(ruleBasedAnalysis("I have paid already"), extractClaims("I have paid already"), null);
  assert.equal(out.riskLevel, "MEDIUM");
  assert.equal(out.verification.status, "NOT_CHECKED");
});

test("parses a plain-language invoice request without AI", () => {
  const d = parseJobText("Invoice Rahim Uddin (rahim@example.com) for 5 hours of logo design at $20/hr, due in 10 days");
  assert.equal(d.recipientEmail, "rahim@example.com");
  assert.equal(d.amount, 100);
  assert.equal(d.dueDays, 10);
  assert.equal(d.currency, "USD");
  assert.equal(d.recipientName, "Rahim Uddin");
  assert.deepEqual(d.missing, []);
});
test("flags a missing email instead of inventing one", () => {
  assert.ok(parseJobText("Bill Sam $300 for a website").missing.includes("recipientEmail"));
});

test("normalizes a PayPal invoice and detects paid state", () => {
  const n = normalizeInvoice({ id: "INV2-X1X1", status: "PAID", detail: { invoice_number: "0007", currency_code: "USD" }, amount: { value: "100.00" }, payments: { paid_amount: { value: "100.00" } }, primary_recipients: [{ billing_info: { name: { given_name: "Ann", surname: "Lee" }, email_address: "a@b.co" } }] });
  assert.equal(n.client, "Ann Lee");
  assert.equal(isPaid(n), true);
});
test("reminder template mentions invoice number", () => {
  assert.match(reminderTemplate({ client: "Ann Lee", number: "0007", due: 50, currency: "USD", dueDate: "2026-11-01" }, 5).subject, /0007/);
});

const rawPaidInvoice = (over = {}) => ({
  id: "INV2-AAAA-BBBB", status: "PAID",
  detail: { invoice_number: "0001", currency_code: "USD" },
  amount: { value: "200.00" },
  payments: {
    paid_amount: { value: "200.00" },
    transactions: [
      { transaction_id: "8AB12345CD678901E", transaction_type: "CAPTURE", status: "PAID", amount: { currency_code: "USD", value: "200.00" }, payment_date: "2026-11-07" },
      { transaction_id: "7XY98765ZY432109F", transaction_type: "REFUND", status: "PAID", amount: { currency_code: "USD", value: "50.00" }, payment_date: "2026-11-08" }
    ]
  },
  ...over
});

test("extracts only the capture from an invoice's payment transactions", () => {
  const captures = extractCaptures(rawPaidInvoice());
  assert.equal(captures.length, 1);
  assert.deepEqual(captures[0], {
    captureId: "8AB12345CD678901E",
    invoiceId: "INV2-AAAA-BBBB",
    status: "PAID",
    amount: { value: "200.00", currency_code: "USD" },
    date: "2026-11-07"
  });
});
test("extracts captures from a normalized invoice too", () => {
  const captures = extractCaptures(normalizeInvoice(rawPaidInvoice()));
  assert.equal(captures.length, 1);
  assert.equal(captures[0].captureId, "8AB12345CD678901E");
});
test("finds a capture in the caller's invoices, and not outside them", () => {
  const mine = rawPaidInvoice();
  const someoneElses = rawPaidInvoice({ id: "INV2-CCCC-DDDD" });
  // The capture is on `someoneElses`, but the caller-owned set is only
  // `mine` with its transactions removed: lookup must not find it.
  const myUnpaid = rawPaidInvoice({ payments: { paid_amount: { value: "0.00" }, transactions: [] } });
  assert.equal(findCaptureInInvoices([myUnpaid], "8AB12345CD678901E"), null);
  assert.equal(findCaptureInInvoices([mine], "8AB12345CD678901E")?.invoiceId, "INV2-AAAA-BBBB");
  assert.equal(findCaptureInInvoices([someoneElses], "DOESNOTEXIST1"), null);
  assert.equal(someoneElses.id, "INV2-CCCC-DDDD");
});
test("non-capture transactions are ignored, even with a transaction id", () => {
  const inv = rawPaidInvoice({
    payments: { transactions: [
      { transaction_id: "11111111111111111", transaction_type: "OTHER", status: "PAID", amount: { currency_code: "USD", value: "10.00" } },
      { transaction_id: "22222222222222222", status: "PAID", amount: { currency_code: "USD", value: "10.00" } }
    ] }
  });
  assert.deepEqual(extractCaptures(inv), []);
});
test("malformed invoices yield no captures instead of throwing", () => {
  assert.deepEqual(extractCaptures(null), []);
  assert.deepEqual(extractCaptures(undefined), []);
  assert.deepEqual(extractCaptures({}), []);
  assert.deepEqual(extractCaptures({ payments: {} }), []);
  assert.deepEqual(extractCaptures({ payments: { transactions: "nope" } }), []);
  assert.deepEqual(extractCaptures({ payments: { transactions: [null, 42, {}] } }), []);
  assert.equal(findCaptureInInvoices(null, "8AB12345CD678901E"), null);
  assert.equal(findCaptureInInvoices([null, {}], "8AB12345CD678901E"), null);
  assert.equal(findCaptureInInvoices([rawPaidInvoice()], ""), null);
});
