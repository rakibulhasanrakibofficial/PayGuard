const $ = (s) => document.querySelector(s);
const API_BASE = String(window.PAYGUARD_API_BASE || "").replace(/\/$/, "");
const SUPABASE_URL = String(window.PAYGUARD_SUPABASE_URL || "");
const SUPABASE_ANON_KEY = String(window.PAYGUARD_SUPABASE_ANON_KEY || "");
const supabase = window.supabase?.createClient && SUPABASE_URL && SUPABASE_ANON_KEY
 ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
async function request(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  if (data.session?.access_token) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  const response = await fetch(`${API_BASE}${url}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
const post = (url, body) => request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
function show(id, html, tone = "") { const el = $(id); el.className = "result " + tone; el.innerHTML = html; }
function esc(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function busy(form, yes) { const b = form.querySelector("button[type=submit]") || form.querySelector("button"); b.disabled = yes; b.dataset.label ||= b.innerHTML; b.innerHTML = yes ? "<span>Please wait…</span>" : b.dataset.label; }
const money = (n, c) => `${Number(n || 0).toFixed(2)} ${esc(c)}`;
let invoices = [];
let reminderId = null;

/* ---------- AI draft fills the invoice form (user reviews before anything is sent) ---------- */
$("#draft-form").addEventListener("submit", async e => {
  e.preventDefault(); const form = e.currentTarget; busy(form, true); $("#draft-note").textContent = "Reading your request…";
  try {
    const d = await post("/api/invoices/draft", { message: new FormData(form).get("message") });
    const f = $("#invoice-form");
    f.recipientName.value = d.recipientName || ""; f.recipientEmail.value = d.recipientEmail || "";
    f.description.value = d.description || ""; f.amount.value = d.amount || ""; f.currency.value = d.currency || "USD"; f.dueDays.value = d.dueDays || 7;
    const miss = (d.missing || []).map(m => m === "recipientEmail" ? "client email" : m);
    $("#draft-note").textContent = (miss.length ? `Please fill in: ${miss.join(", ")}. ` : "Form filled. Check it, then send. ") + `(${d.mode === "AI_ASSISTED" ? "Claude" : "built-in parser"})`;
  } catch (err) { $("#draft-note").textContent = err.message; } finally { busy(form, false); }
});

/* ---------- Create invoice ---------- */
$("#invoice-form").addEventListener("submit", async e => {
  e.preventDefault(); const form = e.currentTarget; busy(form, true); show("#invoice-result", "");
  try {
    const data = await post("/api/invoices", Object.fromEntries(new FormData(form)));
    show("#invoice-result", `<h3>Invoice ${esc(data.invoiceNumber)} created: ${esc(data.status)}</h3><p>Invoice ID: <b>${esc(data.invoiceId)}</b></p>${data.href ? `<p><a target="_blank" rel="noopener noreferrer" href="${esc(data.href)}">Open PayPal invoice</a></p>` : ""}<p>Sandbox test only.</p>`);
    form.reset(); form.dueDays.value = 7; loadInvoices(true); loadActivity();
  } catch (err) { show("#invoice-result", esc(err.message), "risk-high"); } finally { busy(form, false); }
});

/* ---------- Scam check, verified against PayPal ---------- */
const VERIFY_TEXT = {
  PAYMENT_NOT_FOUND: "PayPal has no payment on this invoice.",
  AMOUNT_MISMATCH: "PayPal received less than the client claims.",
  NO_OVERPAYMENT: "PayPal shows no overpayment, so there is nothing to refund.",
  OVERPAYMENT_CONFIRMED: "PayPal confirms an overpayment.",
  PAYMENT_CONFIRMED: "PayPal confirms the invoice is paid.",
  UNPAID_OR_PARTIAL: "The invoice is not fully paid in PayPal."
};
$("#scam-form").addEventListener("submit", async e => {
  e.preventDefault(); const form = e.currentTarget; busy(form, true); show("#scam-result", "");
  try {
    const fd = new FormData(form);
    const data = await post("/api/scam/analyze", { message: fd.get("message"), invoiceId: fd.get("invoiceId") || undefined });
    const tone = data.riskLevel === "HIGH" ? "risk-high" : data.riskLevel === "MEDIUM" ? "risk-medium" : "risk-low";
    const v = data.verification;
    const vbox = v?.invoiceNumber
      ? `<div class="verification-box"><b>PayPal says:</b> invoice ${esc(v.invoiceNumber)} is ${esc(v.status)}; paid ${money(v.paid, v.currency)} of ${money(v.total, v.currency)}.${v.result ? `<br>${esc(VERIFY_TEXT[v.result] || "")}` : ""}</div>`
      : `<div class="verification-box">${esc(v?.note || "")}</div>`;
    show("#scam-result", `<h3>${esc(data.riskLevel)} RISK · ${Number(data.riskScore)} / 100</h3><p>${esc(data.recommendation)}</p>${data.findings?.length ? `<ul>${data.findings.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "<p>No known warning pattern matched. Stay cautious.</p>"}${vbox}<small>${esc(data.analysisMode)} · ${esc(data.disclaimer)}</small>`, tone);
    loadActivity();
  } catch (err) { show("#scam-result", esc(err.message), "risk-high"); } finally { busy(form, false); }
});

/* Capture-ID lookup is intentionally not exposed: ownership cannot be safely established. */

/* ---------- Dashboard ---------- */
function statusBadge(i) {
  const overdue = i.dueDate && new Date(i.dueDate) < new Date(new Date().toDateString()) && i.due > 0;
  if (["PAID", "MARKED_AS_PAID"].includes(i.status)) return ["Paid", "badge-paid"];
  if (i.status === "CANCELLED") return ["Cancelled", "badge-muted"];
  if (i.status === "DRAFT") return ["Draft", "badge-muted"];
  if (i.status === "PARTIALLY_PAID") return [overdue ? "Partly paid, overdue" : "Partly paid", overdue ? "badge-late" : "badge-open"];
  return [overdue ? "Overdue" : "Awaiting payment", overdue ? "badge-late" : "badge-open"];
}
function renderInvoices() {
  const body = $("#invoice-rows");
  const query = ($("#invoice-search")?.value || "").trim().toLowerCase();
  const status = $("#invoice-status-filter")?.value || "all";
  const filtered = invoices.filter(i => {
    const [label, cls] = statusBadge(i);
    const matchesQuery = !query || [i.number, i.client, i.id].some(v => String(v || "").toLowerCase().includes(query));
    const matchesStatus = status === "all" || (status === "paid" && cls === "badge-paid") || (status === "cancelled" && cls === "badge-muted" && i.status === "CANCELLED") || (status === "overdue" && cls === "badge-late") || (status === "open" && !["badge-paid", "badge-muted", "badge-late"].includes(cls));
    return matchesQuery && matchesStatus;
  });
  body.innerHTML = filtered.length ? filtered.map(i => {
    const [label, cls] = statusBadge(i); const paid = cls === "badge-paid";
    return `<tr><td>${i.link ? `<a href="${esc(i.link)}" target="_blank" rel="noopener noreferrer">${esc(i.number)}</a>` : esc(i.number)}</td><td>${esc(i.client)}</td><td>${money(i.total, i.currency)}</td><td>${money(i.paid, i.currency)}</td><td>${esc(i.dueDate || "")}</td><td><span class="badge ${cls}">${label}</span></td>
      <td class="cell-actions"><button class="mini-button" data-act="verify" data-id="${esc(i.id)}">Verify</button>${paid ? "" : `<button class="mini-button" data-act="remind" data-id="${esc(i.id)}">Remind</button><button class="mini-button" data-act="pay" data-id="${esc(i.id)}" title="Sandbox only: simulates the client paying">Simulate payment</button>`}</td></tr>`;
  }).join("") : `<tr><td colspan="7" class="empty-cell">${invoices.length ? "No invoices match your search or filter." : "No invoices yet. Create one above."}</td></tr>`;
  $("#scam-invoice").innerHTML = '<option value="">None, or detect from the message</option>' + invoices.map(i => `<option value="${esc(i.id)}">${esc(i.number)} · ${esc(i.client)} · ${money(i.total, i.currency)}</option>`).join("");
}
$("#invoice-search").addEventListener("input", renderInvoices);
$("#invoice-status-filter").addEventListener("change", renderInvoices);
async function loadInvoices(quiet) {
  try { invoices = (await request("/api/invoices")).invoices; renderInvoices(); }
  catch (err) { if (!quiet) $("#invoice-rows").innerHTML = `<tr><td colspan="7" class="empty-cell">${esc(err.message)}</td></tr>`; }
}
$("#refresh-invoices").addEventListener("click", () => { loadInvoices(); loadActivity(); });
$("#invoice-rows").addEventListener("click", async e => {
  const b = e.target.closest("button[data-act]"); if (!b) return;
  const { act, id } = b.dataset; b.disabled = true;
  try {
    if (act === "verify") { const r = await request(`/api/invoices/${encodeURIComponent(id)}/verify`); show("#invoice-note", `<p>${esc(r.message)}</p>`, r.verified ? "risk-low" : "risk-medium"); }
    if (act === "pay") { await post(`/api/invoices/${encodeURIComponent(id)}/sandbox-pay`); show("#invoice-note", "<p>Sandbox payment recorded. PayPal now shows this invoice as paid.</p>", "risk-low"); await loadInvoices(true); loadActivity(); }
    if (act === "remind") {
      const r = await post(`/api/invoices/${encodeURIComponent(id)}/remind-draft`); reminderId = id;
      const f = $("#reminder-form"); f.subject.value = r.subject; f.note.value = r.note; f.hidden = false;
      $("#reminder-title").textContent = `Reminder (${r.daysOverdue > 0 ? r.daysOverdue + " days overdue" : "not yet overdue"}, ${r.mode === "AI_ASSISTED" ? "written by Claude" : "template"})`;
    }
  } catch (err) { show("#invoice-note", esc(err.message), "risk-high"); } finally { b.disabled = false; }
});
$("#reminder-cancel").addEventListener("click", () => { $("#reminder-form").hidden = true; });
$("#reminder-form").addEventListener("submit", async e => {
  e.preventDefault(); const form = e.currentTarget; busy(form, true);
  try { await post(`/api/invoices/${encodeURIComponent(reminderId)}/remind`, Object.fromEntries(new FormData(form))); form.hidden = true; show("#invoice-note", "<p>Reminder sent through PayPal.</p>", "risk-low"); loadActivity(); }
  catch (err) { show("#invoice-note", esc(err.message), "risk-high"); } finally { busy(form, false); }
});

async function loadActivity() {
  try {
    const { activity } = await request("/api/activity");
    $("#activity").innerHTML = activity.length ? activity.map(a => `<li>${esc(a.text)}<time>${esc(new Date(a.at).toLocaleString())}</time></li>`).join("") : '<li class="empty-cell">No activity yet.</li>';
  } catch { /* non-critical */ }
}

let workspaceStarted = false;
let authMode = "signin";
function startWorkspace() {
 if(workspaceStarted)return; workspaceStarted=true;
 $("#access-gate").hidden=true; $("#workspace-content").hidden=false;
 loadInvoices();loadActivity();setInterval(()=>{loadInvoices(true);loadActivity()},20000);
}
function showAuth(note=""){workspaceStarted=false;$("#workspace-content").hidden=true;$("#access-gate").hidden=false;$("#signout-button").hidden=true;$("#access-note").textContent=note}
function setAuthMode(mode){
 authMode=mode;const signup=mode==="signup";
 $("#access-title").textContent=signup?"Create account":"Welcome back";
 $("#auth-subtitle").textContent=signup?"Create your secure PayGuard account":"Sign in to your payment safety workspace";
 $("#auth-submit-label").textContent=signup?"Create account":"Sign in";
 $("#auth-mode-toggle").textContent=signup?"Already have an account? Sign in":"Create an account";
 $("#auth-reset").hidden=signup;$("#auth-password").autocomplete=signup?"new-password":"current-password";$("#access-note").textContent="";
}
async function initializeWorkspace(){
 try{
  const health=await fetch(`${API_BASE}/api/health`);if(!health.ok)throw new Error("PayGuard API is unavailable.");
  if(!supabase){showAuth("Supabase is not configured yet. The owner must add the Supabase project URL and publishable anon key.");return}
  const {data:{session}}=await supabase.auth.getSession();
  if(session){try{await request("/api/activity");startWorkspace();return}catch{await supabase.auth.signOut()}}
  showAuth();
 }catch(err){showAuth(err.message||"Could not reach PayGuard.")}
}
$("#auth-form").addEventListener("submit",async e=>{
 e.preventDefault();if(!supabase)return showAuth("Supabase setup is required before accounts can be created.");
 const form=e.currentTarget,email=String(new FormData(form).get("email")||"").trim(),password=String(new FormData(form).get("password")||"");
 const button=form.querySelector('button[type="submit"]');button.disabled=true;$("#access-note").textContent=authMode==="signup"?"Creating account…":"Signing in…";
 try{
  const result=authMode==="signup"?await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+window.location.pathname}}):await supabase.auth.signInWithPassword({email,password});
  if(result.error)throw result.error;
  if(authMode==="signup"&&!result.data.session){setAuthMode("signin");$("#access-note").textContent="Account created. Check your email to confirm, then sign in.";return}
  await request("/api/activity");form.reset();startWorkspace();
 }catch(err){$("#access-note").textContent=err.message||"Authentication failed."}
 finally{button.disabled=false}
});
$("#auth-mode-toggle").addEventListener("click",()=>setAuthMode(authMode==="signin"?"signup":"signin"));
$("#auth-reset").addEventListener("click",async()=>{
 const email=$("#auth-email").value.trim();if(!email){$("#access-note").textContent="Enter your email address first.";return}
 $("#access-note").textContent="Sending reset email…";
 const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+window.location.pathname});
 $("#access-note").textContent=error?error.message:"If this email has an account, a reset link has been sent.";
});
$("#signout-button").addEventListener("click",async()=>{if(supabase)await supabase.auth.signOut();location.reload()});
$("#auth-password-toggle").addEventListener("click",()=>{
 const input=$("#auth-password"),reveal=input.type==="password";input.type=reveal?"text":"password";
 $("#auth-password-toggle").setAttribute("aria-label",reveal?"Hide password":"Show password");$("#auth-password-toggle").textContent=reveal?"◎":"◉";
});

