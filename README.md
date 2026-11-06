# PayGuard

AI-assisted invoicing and payment scam-risk analysis for freelancers and small businesses.

> **Sandbox demo only:** PayGuard uses PayPal Sandbox. It does not move real money. AI can identify suspicious language but cannot verify payments. Only authenticated PayPal API records can confirm transaction details.

## Features

- Create and send invoices through PayPal Invoicing API (Sandbox).
- Analyze suspicious client messages with optional Anthropic Claude; rule-based fallback works without an AI key.
- Look up a PayPal capture ID directly against PayPal's API.
- Verify incoming PayPal webhook signatures.
- GitHub Pages frontend and Cloudflare Workers API.
- Server-side secrets; no API credentials in frontend code.

## Stack

Static HTML/CSS/JavaScript, Cloudflare Workers, PayPal REST API, optional Anthropic Messages API.

## Local development

Install Node.js 20+ and Wrangler:

```bash
npm install
npx wrangler dev
```

Set local Worker secrets using Wrangler (it will prompt securely):

```bash
npx wrangler secret put PAYPAL_CLIENT_ID
npx wrangler secret put PAYPAL_CLIENT_SECRET
npx wrangler secret put PAYPAL_WEBHOOK_ID
npx wrangler secret put ANTHROPIC_API_KEY
```

For local development, use a `.dev.vars` file containing these values. It is ignored by Git. Never commit secrets or paste them into chat.

## Deploy the API to Cloudflare Workers

The Worker entry point is `worker/index.js`; `wrangler.toml` configures the Worker name as `payguard-api`.

1. Create or sign in to a Cloudflare account: https://dash.cloudflare.com/
2. Create an API token with **Workers Scripts: Edit** permissions for the account.
3. In GitHub, open **Settings → Secrets and variables → Actions** and add:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
4. Push a change under `worker/` or `wrangler.toml`, or manually run the **Deploy PayGuard API to Cloudflare Workers** workflow.
5. Cloudflare will assign a URL similar to `https://payguard-api.YOUR-SUBDOMAIN.workers.dev`.
6. In Cloudflare Worker settings, add these secrets:
   - `PAYPAL_CLIENT_ID` — PayPal Sandbox REST app client ID
   - `PAYPAL_CLIENT_SECRET` — PayPal Sandbox REST app secret
   - `PAYPAL_WEBHOOK_ID` — Sandbox webhook ID (only needed for webhook verification)
   - `ANTHROPIC_API_KEY` — optional; enables Claude-assisted analysis
7. Optional non-secret variables: `PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com` and `ANTHROPIC_MODEL=claude-sonnet-4-6`.

Do not put secret values in GitHub source files. Keep PayPal in Sandbox mode.

## Deploy the frontend to GitHub Pages

1. Open repository **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**.
2. In **Settings → Secrets and variables → Actions**, add a repository secret named `PAYGUARD_API_BASE` with the complete Worker origin, for example `https://payguard-api.YOUR-SUBDOMAIN.workers.dev` (no trailing slash).
3. Run the **Deploy PayGuard frontend to GitHub Pages** workflow, or push a change under `public/`.

The frontend URL will be:

`https://rakibulhasanrakibofficial.github.io/PayGuard/`

The GitHub Pages workflow writes the backend origin into `public/config.js` during its build. The browser then calls the Cloudflare Worker API.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/scam/analyze` | Analyze a message |
| POST | `/api/invoices` | Create and send a Sandbox invoice |
| GET | `/api/payments/capture/:captureId` | Query a capture from PayPal |
| POST | `/api/paypal/webhook` | Verify webhook signature |

## Important limitations

This is a learning MVP, **not production-ready financial software**. The API currently has no user authentication or invoice ownership controls. Its CORS allowlist is not authentication: non-browser clients can still call public endpoints. Use only a dedicated PayPal Sandbox account and synthetic data. Add Cloudflare rate limiting/WAF rules before sharing the public demo. Webhook signatures are verified, but event IDs are not persisted or deduplicated and no webhook side effects are executed. Before real users or real transactions, add authentication/authorization, ownership checks, persistent audit records, full checkout/order reconciliation, privacy and retention controls, monitoring, and an independent security review. Never treat screenshots, forwarded emails, or AI conclusions as proof of payment.

## Tests

The Cloudflare deployment workflow runs `node --check worker/index.js` before deploying. Live PayPal and Anthropic integration tests require credentials and are not run by that syntax check.


## Optional design workflow (Hallmark)

Hallmark is an optional design skill for compatible AI coding agents. It is not required to run or deploy PayGuard, and installing it does not change the app by itself.

For **Codex CLI** (Node.js 18+ and npm required), install the skill globally:

```bash
npx skills add nutlope/hallmark -g --agent codex
```

Then, from the project directory, ask the agent to review the existing app before making changes. For example:

```text
$hallmark redesign ./public
```

For a static-page audit:

```bash
$hallmark audit ./public/index.html
```

Keep PayGuard's existing form IDs, input names, API endpoints, script loading, and Sandbox safety notices intact when redesigning. Review the diff and run the project checks before deploying. The commands above target Codex CLI; other Codex interfaces may have different skill-installation support.

## License

MIT. See [LICENSE](LICENSE).
