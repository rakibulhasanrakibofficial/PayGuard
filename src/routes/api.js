import { Router } from "express";
import { analyzeMessage } from "../services/scam.js";
import { createAndSendInvoice, getCapture, verifyWebhook } from "../services/paypal.js";

const router = Router();
const currencies = new Set(["USD", "EUR", "GBP", "CAD", "AUD"]);
router.get("/health", (_req, res) => res.json({ ok: true, service: "PayGuard", environment: "SANDBOX" }));

router.post("/scam/analyze", async (req, res, next) => {
  try {
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (message.length < 8) return res.status(400).json({ error: "Message must contain at least 8 characters." });
    if (message.length > 8000) return res.status(400).json({ error: "Message cannot exceed 8,000 characters." });
    res.json(await analyzeMessage(message));
  } catch (error) { next(error); }
});

router.post("/invoices", async (req, res, next) => {
  try {
    const { recipientEmail, recipientName = "", description, currency = "USD" } = req.body || {};
    const amount = Number(req.body?.amount);
    if (typeof recipientEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim())) return res.status(400).json({ error: "Enter a valid recipient email." });
    if (typeof description !== "string" || !description.trim() || description.length > 120) return res.status(400).json({ error: "Description is required (maximum 120 characters)." });
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) return res.status(400).json({ error: "Amount must be greater than zero and at most 100,000." });
    if (!currencies.has(String(currency).toUpperCase())) return res.status(400).json({ error: "Unsupported currency." });
    const result = await createAndSendInvoice({ recipientEmail: recipientEmail.trim(), recipientName: String(recipientName).slice(0, 80), description: description.trim(), amount, currency: String(currency).toUpperCase() });
    res.status(201).json({ ok: true, ...result, environment: "SANDBOX" });
  } catch (error) { next(error); }
});

router.get("/payments/capture/:captureId", async (req, res, next) => {
  try {
    const id = req.params.captureId;
    if (!/^[A-Za-z0-9_-]{5,100}$/.test(id)) return res.status(400).json({ error: "Invalid capture ID." });
    const capture = await getCapture(id);
    res.json({ verified: true, captureId: capture.id, status: capture.status, amount: capture.amount, createTime: capture.create_time, updateTime: capture.update_time, source: "PayPal API", environment: "SANDBOX" });
  } catch (error) { next(error); }
});

router.post("/paypal/webhook", async (req, res, next) => {
  try {
    const result = await verifyWebhook(req.headers, req.body);
    if (result.verification_status !== "SUCCESS") return res.status(400).json({ error: "Webhook signature verification failed." });
    // This MVP verifies authenticity only; it does not persist or execute event side effects.
    res.status(200).json({ received: true, verified: true, eventType: req.body?.event_type || "UNKNOWN", processing: "NOT_IMPLEMENTED" });
  } catch (error) { next(error); }
});
export default router;
