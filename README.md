# PayGuard

AI-assisted invoicing and payment scam-risk analysis for freelancers and small businesses.

> **Sandbox demo only:** PayGuard uses PayPal Sandbox. It does not move real money. AI can identify suspicious language but cannot verify payments. Only authenticated PayPal API records can confirm transaction details.

## Features

- Create and send invoices through PayPal Invoicing API (Sandbox).
- Analyze suspicious client messages with optional Anthropic Claude; rule-based fallback works without an AI key.
- Look up a PayPal capture ID directly against PayPal's API.
- Verify incoming PayPal webhook signatures.
- Responsive vanilla HTML/CSS/JavaScript dashboard.
- Express security headers, JSON body limit, API rate limits and server-side credentials.

## Stack

Node.js 20+, Express, PayPal REST API, optional Anthropic Messages API, vanilla JavaScript.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Configure the environment variables below in a local `.env` file. The repository intentionally does not include an `.env.example` file. Never commit `.env` or paste secret values into chat.

## Environment variables

| Variable | Purpose |
|---|---|
| `PAYPAL_CLIENT_ID` | PayPal Developer Dashboard Sandbox app client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal Developer Dashboard Sandbox app secret |
| `PAYPAL_BASE_URL` | Optional; defaults to PayPal Sandbox API |
| `PAYPAL_WEBHOOK_ID` | Required to verify incoming webhook signatures |
| `ANTHROPIC_API_KEY` | Optional; enables Claude-assisted analysis |
| `ANTHROPIC_MODEL` | Optional; Claude model name |
| `FRONTEND_ORIGIN` | GitHub Pages origin allowed by CORS |
| `PORT` | Hosting provider normally sets this |

Never put PayPal or AI secrets in `public/`, frontend JavaScript, GitHub Pages, or a committed file. Add them only to the backend host's environment-variable settings.

## Deploy

### Frontend: GitHub Pages

The GitHub Actions workflow publishes only the `public/` directory. In the repository, open **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**.

After the workflow succeeds, the frontend URL is:

`https://rakibulhasanrakibofficial.github.io/PayGuard/`

### Backend: Render

The `render.yaml` Blueprint describes the Node/Express API. In Render, create a Blueprint from this repository and add PayPal Sandbox credentials and the optional Anthropic key in the service's Environment settings. Keep all secrets on Render.

After Render provides the backend URL, edit `public/config.js` and set `window.PAYGUARD_API_BASE` to that origin without a trailing slash. Commit the change; GitHub Actions will publish the updated frontend. The browser then calls the Render API.

The free Render service may sleep when idle, so the first request can take longer. GitHub Pages alone cannot run the Express backend.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/scam/analyze` | Analyze a message |
| POST | `/api/invoices` | Create and send a Sandbox invoice |
| GET | `/api/payments/capture/:captureId` | Query a capture from PayPal |
| POST | `/api/paypal/webhook` | Verify webhook signature |

## Tests

Run `npm test`. The current offline tests cover the rule-based scam detector and its payment-verification disclaimer. Live PayPal/AI calls require credentials and are not covered by the offline test suite.

## Important limitations

This is a learning MVP, **not production-ready financial software**. It currently has no user authentication or invoice ownership controls; a deployed demo must use a dedicated PayPal Sandbox account and synthetic data only. Webhook signatures are verified, but this MVP does not persist event IDs, deduplicate deliveries, or execute event side effects. Before real users or real transactions, add authentication/authorization, ownership checks, persistent audit records, full checkout/order reconciliation, privacy and retention controls, robust monitoring, and an independent security review. Do not trust screenshots, forwarded emails, or AI conclusions as payment proof.

## License

MIT. See [LICENSE](LICENSE).
