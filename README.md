# PayGuard

AI-assisted invoicing and payment scam-risk analysis for freelancers and small businesses.

> **Sandbox demo:** PayGuard uses PayPal Sandbox. It does not move real money. AI can identify suspicious language but cannot verify payments. Only authenticated PayPal API responses can confirm PayPal transaction details.

## Features

- Create and send invoices through PayPal Invoicing API (Sandbox).
- Analyze suspicious client messages with optional Anthropic Claude; deterministic rule-based fallback works without an AI key.
- Look up a PayPal capture ID directly against PayPal's API.
- Verify incoming PayPal webhook signatures.
- Responsive vanilla HTML/CSS/JavaScript dashboard.
- Express security headers, JSON body limit, API rate limits and server-side credentials.

## Stack

Node.js 20+, Express, PayPal REST API, optional Anthropic Messages API, vanilla JavaScript.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`. Add Sandbox credentials to `.env`, then open http://localhost:3000.

## PayPal Sandbox setup

1. Sign in at https://developer.paypal.com/.
2. Open Apps & Credentials and select **Sandbox**.
3. Create a REST app and copy its Client ID and Secret into `.env`.
4. Use a Sandbox Business account as the invoice sender and a Sandbox Personal account as the recipient.
5. Test with Sandbox accounts only.

The invoice flow calls `POST /v2/invoicing/invoices` and `POST /v2/invoicing/invoices/{id}/send`. Capture lookup calls `GET /v2/payments/captures/{id}`.

## Optional AI setup

Set `ANTHROPIC_API_KEY` and optionally `ANTHROPIC_MODEL`. Without a key, PayGuard uses its local rule-based detector. Never put API keys in frontend files or commit `.env`.

## Webhooks

Deploy the server, configure a PayPal webhook URL at `https://YOUR_HOST/api/paypal/webhook`, subscribe to relevant events, and set the webhook ID in `PAYPAL_WEBHOOK_ID`. This MVP verifies webhook signatures but does **not** yet persist event IDs, deduplicate deliveries, or execute event side effects.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/scam/analyze` | Analyze a message |
| POST | `/api/invoices` | Create and send Sandbox invoice |
| GET | `/api/payments/capture/:captureId` | Query capture from PayPal |
| POST | `/api/paypal/webhook` | Verify webhook signature |

## Tests

Run `npm test`. The test suite covers local scam rules and input validation helpers where available.

## Important limitations

This is a functional learning MVP, **not production-ready financial software**. Before real users or real transactions, add authentication and authorization, persistent storage, invoice ownership checks, webhook event persistence and idempotency, full order/checkout flow, CSRF strategy, audit logs, privacy/retention controls, robust monitoring, and security review. Reconcile amount, currency, payer and invoice/order reference before treating a payment as satisfying an invoice. Do not trust screenshots, forwarded emails, or AI conclusions as payment proof.

## License

MIT. See [LICENSE](LICENSE).
