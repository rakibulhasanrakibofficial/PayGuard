const $ = (s) => document.querySelector(s);
const API_BASE = String(window.PAYGUARD_API_BASE || "").replace(/\\/$/, "");
async function request(url, options) {
  const response = await fetch(`${API_BASE}${url}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
function show(id, html, tone = "") { const el = $(id); el.className = "result " + tone; el.innerHTML = html; }
function esc(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function busy(form, yes) { const b = form.querySelector("button"); b.disabled = yes; b.dataset.label ||= b.textContent; b.textContent = yes ? "Please wait…" : b.dataset.label; }
$("#invoice-form").addEventListener("submit", async e => {
  e.preventDefault(); const form=e.currentTarget; busy(form,true); show("#invoice-result","");
  try { const data=await request("/api/invoices",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(form)))});
    show("#invoice-result",`<h3>Invoice created: ${esc(data.status)}</h3><p>Invoice ID: <b>${esc(data.invoiceId)}</b></p>${data.href?`<p><a target="_blank" rel="noopener noreferrer" href="${esc(data.href)}">Open PayPal invoice</a></p>`:""}<p>Sandbox test only.</p>`); form.reset();
  } catch(err) { show("#invoice-result",esc(err.message),"risk-high"); } finally { busy(form,false); }
});
$("#scam-form").addEventListener("submit", async e => {
  e.preventDefault(); const form=e.currentTarget; busy(form,true); show("#scam-result","");
  try { const data=await request("/api/scam/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:new FormData(form).get("message")})});
    const tone=data.riskLevel==="HIGH"?"risk-high":data.riskLevel==="MEDIUM"?"risk-medium":"risk-low";
    show("#scam-result",`<h3>${esc(data.riskLevel)} RISK · ${Number(data.riskScore)} / 100</h3><p>${esc(data.recommendation)}</p>${data.findings?.length?`<ul>${data.findings.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:"<p>No known warning pattern matched. Stay cautious.</p>"}<small>${esc(data.analysisMode)} · ${esc(data.disclaimer)}</small>`,tone);
  } catch(err) { show("#scam-result",esc(err.message),"risk-high"); } finally { busy(form,false); }
});
$("#verify-form").addEventListener("submit", async e => {
  e.preventDefault(); const form=e.currentTarget; busy(form,true); show("#verify-result","");
  try { const id=String(new FormData(form).get("captureId")).trim(); const data=await request("/api/payments/capture/"+encodeURIComponent(id));
    show("#verify-result",`<h3>PayPal API response: ${esc(data.status)}</h3><p>Capture ID: ${esc(data.captureId)}</p><p>Amount: ${esc(data.amount?.value)} ${esc(data.amount?.currency_code)}</p><p>Source: ${esc(data.source)} · ${esc(data.environment)}</p>`,data.status==="COMPLETED"?"risk-low":"risk-medium");
  } catch(err) { show("#verify-result",esc(err.message),"risk-high"); } finally { busy(form,false); }
});
