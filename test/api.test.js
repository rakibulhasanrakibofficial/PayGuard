import test from "node:test";
import assert from "node:assert/strict";
import app from "../src/app.js";

// Boots the Express adapter + Worker handler with no secrets: validation and rule-based paths only.
let server, base;
test.before(() => new Promise((resolve) => { delete process.env.ANTHROPIC_API_KEY; server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); }); }));
test.after(() => server.close());
const post = (p, b) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

test("health reports sandbox and missing PayPal config", async () => {
  const d = await (await fetch(base + "/api/health")).json();
  assert.equal(d.environment, "SANDBOX");
  assert.equal(d.ai, "rules-only");
});
test("invoice draft works without an AI key", async () => {
  const d = await (await post("/api/invoices/draft", { message: "Invoice Sam Hill (sam@x.io) for 3 hours of editing at $40/hr" })).json();
  assert.equal(d.amount, 120);
  assert.equal(d.mode, "RULE_BASED");
});
test("scam analysis works without PayPal credentials when no invoice is selected", async () => {
  const d = await (await post("/api/scam/analyze", { message: "I overpaid you, refund the difference urgently" })).json();
  assert.equal(d.riskLevel, "HIGH");
  assert.equal(d.verification.status, "NOT_CHECKED");
});
test("rejects bad invoice input and invalid ids", async () => {
  assert.equal((await post("/api/invoices", { recipientEmail: "nope", description: "x", amount: 5 })).status, 400);
  assert.equal((await fetch(base + "/api/invoices/not-an-id/verify")).status, 400);
});
test("foreign origins are blocked", async () => {
  const r = await fetch(base + "/api/health", { headers: { Origin: "https://evil.example" } });
  assert.equal(r.status, 403);
});
