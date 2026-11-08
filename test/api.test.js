import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";

test("health is public and reports Supabase authentication mode", async () => {
  const response = await worker.fetch(new Request("https://payguard.test/api/health"), {});
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.auth, "supabase");
  assert.equal(data.authenticationRequired, true);
});

test("protected routes fail closed when Supabase is not configured", async () => {
  const response = await worker.fetch(new Request("https://payguard.test/api/activity"), {});
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Unexpected server error/);
});

test("protected routes reject requests without a bearer token when configured", async () => {
  const response = await worker.fetch(new Request("https://payguard.test/api/activity"), {
    headers: { Origin: "https://rakibulhasanrakibofficial.github.io" }
  });
  assert.equal(response.status, 503);
});

test("capture lookup fails closed when Supabase is not configured", async () => {
  const response = await worker.fetch(new Request("https://payguard.test/api/captures/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ captureId: "8AB12345CD678901E" })
  }), {});
  assert.equal(response.status, 503);
});

test("Worker CORS preflight allows bearer authorization", async () => {
  const response = await worker.fetch(new Request("https://payguard.test/api/activity", {
    method: "OPTIONS",
    headers: {
      Origin: "https://rakibulhasanrakibofficial.github.io",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization"
    }
  }), {});
  assert.equal(response.status, 204);
  assert.match(response.headers.get("Access-Control-Allow-Headers"), /Authorization/i);
});
