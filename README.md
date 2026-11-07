# PayGuard

AI-assisted invoicing and payment scam-risk analysis for freelancers and small businesses.

> **Sandbox demo only:** PayGuard uses PayPal Sandbox. It does not move real money. AI can identify suspicious language but cannot verify payments. Only authenticated PayPal API records can confirm transaction details.

## The problem

Freelancers lose time chasing invoices and lose money to payment scams ("I overpaid, send back the difference", fake payment screenshots). PayGuard handles both, and **PayPal is always the source of truth**.

## Features

- **AI invoice drafting:** describe the job in one sentence ("Invoice Rahim (rahim@example.com) for 5 hours of logo design at $20/hr, due in 10 days"). Claude fills the form; you review it; PayPal's Invoicing API creates and sends it. Works without an AI key through a built-in parser.
- **Invoice dashboard:** live list from PayPal with status (awaiting, overdue, partly paid, paid), refreshed every 20 seconds.
- **Payment verification:** "Verify" asks PayPal whether an invoice is truly paid. Capture-ID lookup is also included.
- **Late-payment reminders:** AI writes a polite reminder with the right tone; PayPal delivers it.
- **Scam check backed by PayPal:** paste a client message. PayGuard flags scam patterns, extracts what the client *claims* (paid X, refund Y), then checks the related invoice in PayPal. "I paid $500, send back $300" against an unpaid invoice becomes **HIGH risk: PAYMENT_NOT_FOUND**. AI can only raise risk, never excuse it.
- **Webhooks:** signature-verified with PayPal and processed once per event id (idempotent), shown in the activity feed.
- Server-side secrets only. No API credentials in frontend code.
- Supabase email/password accounts with password reset and server-verified sessions.
- Per-user invoice ownership and private activity history (shared PayPal Sandbox merchant credentials remain server-side).

## Stack

Static HTML/CSS/JavaScript, one API implementation (`worker/`) that runs on **Cloudflare Workers** and also on **Node/Express** (local and Render), PayPal REST API (Sandbox), optional Anthropic Claude.

## Quick start (any judge, 2 minutes)

```bash
git clone https://github.com/rakibulhasanrakibofficial/PayGuard.git
cd PayGuard
npm install
cp .env.example .env     # Windows: copy .env.example .env
# add PayPal Sandbox credentials; configure PAYGUARD_ACCESS_KEY for a protected private demo
npm start
```
Open http://localhost:3000. Frontend and API run together on one origin.

**Try it end to end**
1. Create an invoice for 200 USD (type a sentence in "Describe the job", or fill the form).
2. In "Check a message", select that invoice and paste: `Hi, I sent $500 by mistake. Please send back the $300 difference today.`
3. PayGuard shows **HIGH risk**: PayPal has no payment on the invoice. Do not refund.
4. Click **Simulate payment** on the invoice (Sandbox helper) and run the check again to see PayPal's answer change.

`npm test` runs unit and API tests (no PayPal credentials needed).

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

## Supabase account setup

The multi-user branch uses Supabase Auth for email/password sign-in and PostgREST tables for invoice ownership and per-user activity.

1. Create a Supabase project at https://supabase.com/dashboard.
2. In **SQL Editor**, run the complete migration in `supabase/migrations/202611080001_multi_user_ownership.sql`.
3. In **Project Settings → API**, copy the Project URL and publishable/anon key. Add them to `public/config.js` as `PAYGUARD_SUPABASE_URL` and `PAYGUARD_SUPABASE_ANON_KEY`. These are public browser settings; never put the service-role key in frontend code.
4. In **Authentication → URL Configuration**, add the GitHub Pages URL `https://rakibulhasanrakibofficial.github.io/PayGuard/` to the allowed redirect URLs.
5. In Cloudflare Worker **Settings → Variables and Secrets**, add secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. The service-role key must remain only in the Worker secret store.
6. Deploy the Worker, then deploy the Pages frontend. New users create accounts with email and password; if email confirmation is enabled, they must confirm their email before signing in.

The Worker verifies every Supabase access token against Supabase Auth. Invoice IDs are mapped to the creating user; list and invoice actions are restricted to that owner. User activity is stored separately. Existing PayPal invoices created before ownership tracking are not automatically assigned to anyone. Capture-ID lookup is disabled until capture ownership can be securely mapped.

Supabase Auth and the ownership schema must be configured before protected API routes will work. Keep PayPal Sandbox enabled; this is not a production-ready payments platform.

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
7. Keep PayPal and Supabase service credentials in Worker secrets. `/api/health` and PayPal signature-verified webhooks remain public by design.
8. Optional non-secret variables: `PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com` and `ANTHROPIC_MODEL=claude-sonnet-4-6`.

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
| GET | `/api/health` | Health and configuration status |
| POST | `/api/invoices/draft` | AI (or rule-based) draft from plain language; nothing is sent |
| POST | `/api/invoices` | Create and send a Sandbox invoice |
| GET | `/api/invoices` | List invoices from PayPal |
| GET | `/api/invoices/:id/verify` | Ask PayPal if an invoice is fully paid |
| POST | `/api/invoices/:id/remind-draft` | AI-written reminder text |
| POST | `/api/invoices/:id/remind` | Send the reminder through PayPal |
| POST | `/api/invoices/:id/sandbox-pay` | Sandbox only: simulate the client paying |
| POST | `/api/scam/analyze` | Risk analysis, optionally verified against an invoice (`invoiceId`) |
| GET | `/api/payments/capture/:captureId` | Query a capture from PayPal |
| POST | `/api/paypal/webhook` | Verify signature, process each event once |
| GET | `/api/activity` | Recent events |

## Deploy on Render (Node, one service)

`render.yaml` is included. In Render choose **New, Blueprint**, select this repo and set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` (and optionally `ANTHROPIC_API_KEY`, `PAYPAL_WEBHOOK_ID`). Point your PayPal Sandbox webhook to `https://<your-app>.onrender.com/api/paypal/webhook` with the events `INVOICING.INVOICE.PAID`, `INVOICING.INVOICE.UPDATED` and `INVOICING.INVOICE.CANCELLED`.

## Persistence

Activity and webhook de-duplication use Cloudflare KV when a namespace named `PAYGUARD_KV` is bound (add `[[kv_namespaces]]` in `wrangler.toml`). Without it they live in memory, which is fine for a demo but resets on restart. Invoices themselves always live in PayPal.

## Important limitations

This is a learning MVP, **not production-ready financial software**. Account authentication is individual, but PayPal API credentials still connect to one shared Sandbox merchant. Invoice ownership is enforced by PayGuard metadata; invoices created before this feature are not assigned to users. Worker throttling is best-effort per isolate, not globally shared; configure Cloudflare edge rate limiting/WAF as well. Keep PayGuard in Sandbox, use synthetic data, and never publish the shared key. Before real users or money, implement individual authentication, invoice ownership, durable audit records, reliable webhook processing, full checkout reconciliation, privacy controls, edge rate limiting and an independent security review. Never treat screenshots, forwarded emails or AI conclusions as proof of payment.

## Tests

`npm test` runs unit tests for verification logic plus API adapter and access-key tests. The Cloudflare workflow runs tests and syntax checks before deployment. Live PayPal and Anthropic calls need credentials and are not covered by automated tests.

### Security behavior

- `PAYGUARD_ACCESS_KEY` must be at least 32 characters. The static frontend sends it in `X-PayGuard-Access-Key` and stores it only in the current tab's `sessionStorage`.
- `PAYGUARD_REQUIRE_ACCESS_KEY=true` makes protected API routes fail closed when the secret is missing. The Cloudflare config enables this by default.
- `/api/health` is public and reveals configuration flags. `/api/paypal/webhook` bypasses the shared key only because PayPal signature verification is mandatory on that route.
- Worker-level throttling is best-effort per isolate. Configure Cloudflare edge rate limiting/WAF as well.
- This is a shared-key demo gate, not production authentication or invoice-level authorization.


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
