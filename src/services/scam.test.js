import test from "node:test";
import assert from "node:assert/strict";
import { ruleBasedAnalysis } from "./scam.js";

test("flags overpayment and refund pressure as high risk", () => {
  const result = ruleBasedAnalysis("I overpaid you. Refund the difference urgently with a payment screenshot.");
  assert.equal(result.riskLevel, "HIGH");
  assert.ok(result.findings.length >= 3);
  assert.equal(result.verificationStatus, "NOT_VERIFIED");
});
test("does not treat ordinary work message as proof of payment", () => {
  const result = ruleBasedAnalysis("Hello, can you send me the website design draft tomorrow?");
  assert.equal(result.riskLevel, "LOW");
  assert.equal(result.verificationStatus, "NOT_VERIFIED");
});
test("always includes a payment verification disclaimer", () => {
  assert.match(ruleBasedAnalysis("Please send the invoice").disclaimer, /cannot|Only authenticated/i);
});
