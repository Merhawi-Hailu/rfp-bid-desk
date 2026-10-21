(() => {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clip = (s, n) => (s && s.length > n ? s.slice(0, n) : s || "");
const NA = "Information Not Provided";
const API = String((window.BID_DESK_CONFIG || {}).apiUrl || "").replace(/\/+$/, "");
const { DEMO, SAMPLE_RFP } = window.BID_DESK_DEMO;
const LIB = { PDF: "vendor/pdf.min.js", PDFW: "vendor/pdf.worker.min.js", MAMMOTH: "vendor/mammoth.browser.min.js" };
const KIND = { cv: "CVs", project: "Past Projects", letter: "Reference Letters", cert: "Certificates" };
const KIND_ONE = { cv: "CV", project: "Project", letter: "Letter", cert: "Certificate" };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};
const sess = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* ignore */ } },
};

/* ---------------- state ---------------- */
const S = { token: null, demoOn: true, local: [], localName: "", added: [], runs: store.get("bdRuns", []), rfpName: "", current: null, ctls: [], running: false };
const allDocs = () => [...(S.demoOn ? DEMO.map((d, i) => ({ ...d, id: "demo" + i, src: "demo" })) : []), ...S.local, ...S.added];

/* ---------------- helpers ---------------- */
let toastT;
function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3200); }
function banner(m) { const b = $("#banner"); b.textContent = m; b.hidden = !m; }
const loaded = {};
function loadScript(src) {
  return loaded[src] ||= new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.onload = res;
    s.onerror = () => { delete loaded[src]; rej(new Error("A file reader could not load. Reload the page and try again.")); };
    document.head.appendChild(s);
  });
}
async function extractText(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") {
    await loadScript(LIB.PDF); await loadScript(LIB.PDFW);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = LIB.PDFW;
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    const out = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const tc = await (await pdf.getPage(i)).getTextContent();
      let line = "", lines = [];
      for (const it of tc.items) { line += it.str; if (it.hasEOL) { lines.push(line); line = ""; } else line += " "; }
      if (line.trim()) lines.push(line);
      out.push(`[Page ${i}]\n` + lines.map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n"));
    }
    const text = out.join("\n\n");
    if (text.replace(/\[Page \d+\]/g, "").trim().length < 40) throw new Error(`"${file.name}" looks like a scanned PDF with no text. Use a text based PDF or paste the text.`);
    return { text, pages: pdf.numPages };
  }
  if (ext === "docx") {
    await loadScript(LIB.MAMMOTH);
    const r = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { text: r.value.replace(/\n{3,}/g, "\n\n").trim() };
  }
  if (["txt", "md", "csv"].includes(ext)) return { text: await file.text() };
  throw new Error(`"${file.name}" is not a supported type.`);
}
const supported = f => /\.(pdf|docx|txt|md|csv)$/i.test(f.name);
const fmtN = n => n.toLocaleString("en-ZA");
const fmtDate = ms => new Date(ms).toLocaleString("en-ZA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const slug = s => (s || "bid-analysis").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "bid-analysis";
const arr = v => (Array.isArray(v) ? v : []);
const str = v => (v == null || v === "" ? NA : String(v));
const isNA = v => !v || /information not provided/i.test(String(v));
function classify(path) {
  const p = path.toLowerCase();
  if (/(^|[^a-z])(cv|cvs|resume|résumé|curriculum)([^a-z]|$)/.test(p)) return "cv";
  if (/certificate|certification|(^|[^a-z])cert([^a-z]|$)|(^|[^a-z])(csd|sbd|sars|b-?bbee|bee)([^a-z]|$)|tax (clearance|compliance)|compliance|clearance|accreditation|registration/.test(p)) return "cert";
  if (/reference|letter|testimonial/.test(p)) return "letter";
  return "project";
}
function errCopy(code) {
  return ({
    unauthorized: "Your sign in has ended. Sign in again, then run this step.",
    rate_limited: "Too many requests in a short time. Wait a minute, then try again.",
    busy: "The AI service is busy right now. Wait a minute, then try again.",
    daily_limit: "Today's free AI allowance is used up. It resets at 02:00 South African time. Try again after that.",
    too_large: "The documents are too long for one request. Shorten the tender or use fewer documents.",
    bad_request: "Something in the request was missing. Check the tender and documents, then try again.",
    invalid_json: "The answer came back in the wrong shape. Run this step again.",
    server_not_configured: "The backend is not set up yet. Ask the app owner to finish the Cloudflare setup.",
    network: "Could not reach the backend. Check your connection and try again.",
  })[code] || "Something went wrong in this step. Run it again.";
}
function pillFor(v) {
  const t = String(v || "").toLowerCase();
  if (/^(met|yes|high|found|compliant)$/.test(t)) return "ok";
  if (/^(partly met|partly|medium|partially compliant)$/.test(t)) return "warn";
  if (/^(not met|no|low|not found|not compliant)$/.test(t)) return "bad";
  return "na";
}
const pill = v => `<span class="pill ${pillFor(v)}">${esc(v || "Unknown")}</span>`;

/* ---------------- backend ---------------- */
async function api(path, body, signal) {
  if (!API) throw { code: "server_not_configured" };
  let r;
  try {
    r = await fetch(API + path, {
      method: "POST", signal, credentials: "omit", referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json", ...(S.token ? { Authorization: "Bearer " + S.token } : {}) },
      body: JSON.stringify(body),
    });
  } catch (e) { throw { code: e && e.name === "AbortError" ? "cancelled" : "network" }; }
  let j = {}; try { j = await r.json(); } catch { /* ignore */ }
  if (r.status === 401 && path !== "/api/login") { signOut(true); throw { code: "unauthorized" }; }
  if (!r.ok) throw { code: j.error || (r.status === 413 ? "too_large" : "upstream_error") };
  return j;
}

/* ---------------- login ---------------- */
function showGate(msg) {
  $("#gate").hidden = false; const e = $("#loginErr"); e.hidden = !msg; e.textContent = msg || "";
  setTimeout(() => $("#pw").focus(), 0);
}
function signOut(expired) {
  S.token = null; sess.set("bdToken", null); sess.set("bdExp", null);
  S.ctls.forEach(c => c.abort());
  showGate(expired ? "Your sign in has ended. Sign in again." : "");
}
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = $("#loginBtn"), pw = $("#pw").value;
  if (!pw) return;
  btn.disabled = true; btn.textContent = "Signing in...";
  try {
    const j = await api("/api/login", { password: pw });
    S.token = j.token; sess.set("bdToken", j.token); sess.set("bdExp", String(j.expiresAt));
    $("#pw").value = ""; $("#gate").hidden = true; renderSources();
  } catch (err) {
    const m = { wrong_password: "That password is not right.", rate_limited: "Too many attempts. Wait a minute, then try again.", server_not_configured: errCopy("server_not_configured"), network: errCopy("network") }[err.code] || "Could not sign in. Try again.";
    showGate(m);
  } finally { btn.disabled = false; btn.textContent = "Sign in"; }
});
$("#logoutBtn").addEventListener("click", () => signOut(false));

/* ---------------- tabs ---------------- */
document.querySelectorAll(".tab[data-panel]").forEach(b => b.addEventListener("click", () => showTab(b.dataset.panel)));
function showTab(n) {
  document.querySelectorAll(".tab[data-panel]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.panel === n)));
  document.querySelectorAll(".panel").forEach(p => (p.hidden = p.id !== "panel-" + n));
}
document.querySelectorAll(".drop").forEach(z => {
  ["dragenter", "dragover"].forEach(e => z.addEventListener(e, () => z.classList.add("over")));
  ["dragleave", "drop"].forEach(e => z.addEventListener(e, () => z.classList.remove("over")));
});

/* ---------------- tender intake ---------------- */
$("#rfpFile").addEventListener("change", async e => {
  const f = e.target.files[0]; if (!f) return;
  const m = $("#rfpMeta"); m.hidden = false; m.textContent = `Reading ${f.name}...`;
  try {
    const { text, pages } = await extractText(f);
    $("#rfpText").value = text; S.rfpName = f.name;
    if (!$("#bidTitle").value.trim()) $("#bidTitle").value = f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
    m.textContent = `${f.name} · ${pages ? pages + " pages · " : ""}${fmtN(text.length)} characters`;
  } catch (err) { m.textContent = err.message; }
  e.target.value = ""; renderSources();
});
$("#rfpText").addEventListener("input", renderSources);
$("#loadSample").addEventListener("click", () => {
  $("#rfpText").value = SAMPLE_RFP; $("#bidTitle").value = "Northvale data analytics platform (sample)"; S.rfpName = "sample-tender.txt";
  const m = $("#rfpMeta"); m.hidden = false; m.textContent = `Sample tender loaded · ${fmtN(SAMPLE_RFP.length)} characters`;
  if (!S.demoOn) { S.demoOn = true; renderTree(); }
  renderSources(); toast("Sample tender loaded");
});

/* ---------------- sources panel ---------------- */
function counts(docs) { const c = { cv: 0, project: 0, letter: 0, cert: 0 }; docs.forEach(d => { if (d.kind in c) c[d.kind]++; }); return c; }
function cstr(c) { return `${c.cv} CVs · ${c.project} projects · ${c.letter} letters · ${c.cert} certificates`; }
function renderSources() {
  $("#sources").innerHTML = `
    <li><label class="toggle"><input type="checkbox" id="srcDemo" ${S.demoOn ? "checked" : ""}><div><b>Demo repository (fictional)</b><span>${cstr(counts(DEMO))}</span></div></label></li>
    ${S.local.length ? `<li><div class="toggle"><div><b>${esc(S.localName)} (this laptop)</b><span>${cstr(counts(S.local))}</span></div></div></li>` : ""}
    ${S.added.length ? `<li><div class="toggle"><div><b>Added this session</b><span>${cstr(counts(S.added))}</span></div></div></li>` : ""}
    <li><button class="btn link" type="button" id="goRepo">${S.local.length ? "Change folder" : "Open a folder from this laptop"}</button></li>`;
  $("#srcDemo").addEventListener("change", e => { S.demoOn = e.target.checked; renderTree(); renderSources(); });
  $("#goRepo").addEventListener("click", () => showTab("repo"));
  $("#runBtn").disabled = S.running || !S.token || $("#rfpText").value.trim().length < 200;
  $("#docCount").textContent = allDocs().length;
  $("#modeTag").hidden = !S.demoOn;
}

/* ---------------- repository ---------------- */
$("#folderInput").addEventListener("change", async e => {
  const files = [...e.target.files].filter(supported).slice(0, 300);
  const m = $("#folderMeta"); m.hidden = false;
  if (!files.length) { m.textContent = "No PDF, Word or text files found in that folder."; return; }
  const root = (files[0].webkitRelativePath || files[0].name).split("/")[0] || "Local folder";
  const out = [], bad = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i], path = f.webkitRelativePath || f.name;
    m.textContent = `Reading ${i + 1} of ${files.length}: ${path}`;
    if (f.size > 25e6) { bad.push(path); continue; }
    try { const { text } = await extractText(f); out.push({ id: "loc" + i, src: "local", kind: classify(path), path, title: f.name.replace(/\.[^.]+$/, ""), text: clip(text, 200000), fileDate: f.lastModified || null, file: f }); }
    catch { bad.push(path); }
  }
  S.local = out; S.localName = root;
  m.textContent = `${root}: read ${out.length} files${bad.length ? `, skipped ${bad.length} (scanned or unsupported)` : ""}.`;
  e.target.value = ""; renderTree(); renderSources();
});
$("#addFiles").addEventListener("change", e => { const fs = [...e.target.files]; const m = $("#addMeta"); m.hidden = !fs.length; m.textContent = fs.map(f => f.name).join(", "); });
$("#addForm").addEventListener("submit", async e => {
  e.preventDefault();
  const kind = $("#addKind").value, files = [...$("#addFiles").files];
  if (!files.length) { toast("Choose at least one file."); return; }
  const btn = $("#addBtn"); btn.disabled = true; btn.textContent = "Adding...";
  let added = 0; const probs = [];
  for (const f of files) {
    try {
      const { text } = await extractText(f);
      S.added.push({ id: "add" + Math.random().toString(36).slice(2), src: "added", kind, path: `Added documents/${KIND[kind]}/${f.name}`, title: f.name.replace(/\.[^.]+$/, ""), text: clip(text, 200000), fileDate: f.lastModified || null, file: f });
      added++;
    } catch (err) { probs.push(err.message || `Could not add ${f.name}.`); }
  }
  btn.disabled = false; btn.textContent = "Add documents";
  if (added) { $("#addFiles").value = ""; $("#addMeta").hidden = true; toast(`Added ${added} document${added > 1 ? "s" : ""}`); }
  if (probs.length) toast(probs[0]);
  renderTree(); renderSources();
});
let openPrev = null;
function renderTree() {
  const docs = allDocs(), box = $("#tree");
  renderCvCheck(); renderCertCheck();
  if (!docs.length) { box.innerHTML = `<header><h2>Document folder</h2></header><p class="emptybig">No documents. Turn on the demo repository on the Analyse tab, open a folder, or add documents.</p>`; return; }
  const groups = {};
  docs.forEach(d => { const dir = d.path.split("/").slice(0, -1).join("/") || "(top level)"; (groups[dir] ||= []).push(d); });
  const label = k => KIND_ONE[k] || "Project";
  box.innerHTML = `<header><h2>Document folder</h2><span class="note">${cstr(counts(docs))}</span></header>` +
    Object.keys(groups).sort().map(dir => `<section class="folder"><h3>${esc(dir)}<span class="c">${groups[dir].length}</span></h3>${
      groups[dir].map(d => `<div class="file"><div class="nm">${esc(d.path.split("/").pop())}<span>${label(d.kind)} · ${fmtN(d.text.length)} chars</span></div>
        ${d.src !== "demo" ? `<select class="kindsel" data-kind="${esc(d.id)}" aria-label="Document type">${Object.keys(KIND).map(k => `<option value="${k}" ${d.kind === k ? "selected" : ""}>${label(k)}</option>`).join("")}</select>` : ""}
        <button class="btn small" data-prev="${esc(d.id)}" type="button">${openPrev === d.id ? "Hide" : "View"}</button>
        ${d.src === "added" ? `<button class="btn small danger" data-adel="${esc(d.id)}" type="button">Remove</button>` : ""}
        ${openPrev === d.id ? `<div class="preview">${esc(clip(d.text, 4000))}${d.text.length > 4000 ? "\n..." : ""}</div>` : ""}</div>`).join("")}</section>`).join("");
}
$("#tree").addEventListener("click", e => {
  const p = e.target.closest("[data-prev]"); if (p) { openPrev = openPrev === p.dataset.prev ? null : p.dataset.prev; renderTree(); return; }
  const d = e.target.closest("[data-adel]"); if (d) { S.added = S.added.filter(x => x.id !== d.dataset.adel); renderTree(); renderSources(); }
});
$("#tree").addEventListener("change", e => {
  const s = e.target.closest("[data-kind]"); if (!s) return;
  const d = [...S.local, ...S.added].find(x => x.id === s.dataset.kind); if (d) { d.kind = s.value; renderSources(); }
});

/* ---------------- CV freshness check ---------------- */
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const SAFE_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const DAY = 864e5;

/** Reads one date in common CV formats. Returns a Date or null. */
function parseDateText(s) {
  s = String(s || "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (m) return mkDate(+m[1], +m[2] - 1, m[3] ? +m[3] : 1);
  m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/); // day/month/year, as used in South Africa
  if (m) return mkDate(+m[3], +m[2] - 1, +m[1]);
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()] != null) return mkDate(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()] != null) return mkDate(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
  m = s.match(/^([A-Za-z]{3,9})\.?,?\s+(\d{4})/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()] != null) return mkDate(+m[2], MONTHS[m[1].slice(0, 3).toLowerCase()], 1);
  return null;
}
function mkDate(y, mo, d) {
  if (y < 1990 || y > 2100 || mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo, d);
  return dt.getMonth() === mo ? dt : null;
}
/** Finds a "last updated" date written in the CV text. */
function dateFromText(text) {
  const head = String(text || "").slice(0, 6000);
  const re = /(?:cv\s+)?(?:last\s+updated|updated\s+on|updated|last\s+revised|revised|date\s+of\s+cv|cv\s+date)\s*[:\-]?\s*([^\n|;]{4,30})/gi;
  let m;
  while ((m = re.exec(head))) { const d = parseDateText(m[1]); if (d && d.getTime() <= Date.now() + DAY) return d; }
  return null;
}
const cvOverrides = () => store.get("bdCvMeta", {});
const reminders = () => store.get("bdReminders", {});
const cvPolicy = () => Number(store.get("bdCvPolicy", 12)) || 12;

function cvMeta(doc) {
  const o = cvOverrides()[doc.path] || {};
  const name = doc.title.replace(/[\s_-]*(curriculum vitae|cv|resume|résumé)$/i, "").replace(/[_-]+/g, " ").trim() || doc.title;
  const emailText = (doc.text.match(EMAIL_RE) || [])[0] || "";
  let updated = null, source = "";
  if (o.date) { updated = parseDateText(o.date); source = "entered by you"; }
  if (!updated) { updated = dateFromText(doc.text); if (updated) source = "from CV text"; }
  if (!updated && doc.fileDate) { updated = new Date(doc.fileDate); source = "file saved date"; }
  const email = o.email || emailText;
  return { name, email, emailSource: o.email ? "entered by you" : emailText ? "from CV text" : "", updated, source };
}
function cvStatus(meta, policy = cvPolicy()) {
  if (!meta.updated) return { key: "unknown", label: "Date unknown", cls: "na", months: null };
  const now = new Date();
  let months = (now.getFullYear() - meta.updated.getFullYear()) * 12 + (now.getMonth() - meta.updated.getMonth());
  if (now.getDate() < meta.updated.getDate()) months--;
  months = Math.max(0, months);
  if (months >= policy) return { key: "overdue", label: "Overdue", cls: "bad", months };
  if (months >= policy - 2) return { key: "due", label: "Due soon", cls: "warn", months };
  return { key: "current", label: "Current", cls: "ok", months };
}
const ageText = m => (m == null ? "" : m === 0 ? "under 1 month" : m === 1 ? "1 month" : m < 24 ? `${m} months` : `${Math.floor(m / 12)} years ${m % 12 ? (m % 12) + " months" : ""}`.trim());
const fmtDay = d => d.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function reminderText(meta, st) {
  const first = meta.name.split(/\s+/)[0] || "there";
  const due = fmtDay(new Date(Date.now() + 14 * DAY));
  const sender = String(store.get("bdSender", "") || "").trim();
  const when = meta.updated
    ? `Your CV on file was last updated on ${fmtDay(meta.updated)}, which is ${ageText(st.months)} ago.`
    : "We could not find a date on your CV on file, so we cannot tell how current it is.";
  const subject = "Please update your CV for tender submissions";
  const body = `Hi ${first},

We keep consultant CVs up to date so they are ready for tender submissions. ${when} Our rule is to update CVs at least every ${cvPolicy()} months.

Please send me an updated CV by ${due}. Include:
- recent projects, with client, your role, dates and value
- new qualifications and certifications, with dates
- the date you updated the CV, near the top (for example "CV last updated: ${fmtDay(new Date())}")

Thank you.

${sender || "[Your name]"}`;
  return { subject, body };
}
const mailto = (to, subject, body, bcc) =>
  `mailto:${to || ""}?${bcc ? "bcc=" + encodeURIComponent(bcc) + "&" : ""}subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

function renderCvCheck() {
  const cvs = allDocs().filter(d => d.kind === "cv");
  const rows = cvs.map(d => { const meta = cvMeta(d); return { d, meta, st: cvStatus(meta) }; });
  const order = { overdue: 0, unknown: 1, due: 2, current: 3 };
  rows.sort((a, b) => order[a.st.key] - order[b.st.key] || (b.st.months ?? 0) - (a.st.months ?? 0));
  const n = k => rows.filter(r => r.st.key === k).length;
  const late = n("overdue");
  const badge = $("#cvDue"); badge.textContent = late; badge.classList.toggle("zero", !late);
  if ($("#cvPolicy").value !== String(cvPolicy())) $("#cvPolicy").value = String(cvPolicy());
  if (document.activeElement !== $("#senderName")) $("#senderName").value = store.get("bdSender", "") || "";

  if (!rows.length) {
    $("#cvSummary").innerHTML = "";
    $("#cvTable").innerHTML = `<p class="emptybig">No CVs found. Turn on the demo repository, open a folder, or add CVs in the Document folder tab.</p>`;
    return;
  }
  const overdueWithEmail = rows.filter(r => r.st.key === "overdue" && SAFE_EMAIL.test(r.meta.email));
  const bulk = overdueWithEmail.length
    ? (() => { const t = reminderText({ name: "team", updated: null }, { months: null });
        const body = t.body.replace("Hi team,", "Hi all,").replace("We could not find a date on your CV on file, so we cannot tell how current it is.", `Your CV on file is more than ${cvPolicy()} months old.`);
        return `<a class="btn small" id="bulkMail" href="${esc(mailto("", t.subject, body, overdueWithEmail.map(r => r.meta.email).join(",")))}">Email all overdue (${overdueWithEmail.length})</a>`; })()
    : "";
  $("#cvSummary").innerHTML = `
    <span class="count bad"><b>${late}</b> overdue</span>
    <span class="count warn"><b>${n("due")}</b> due soon</span>
    <span class="count ok"><b>${n("current")}</b> current</span>
    <span class="count"><b>${n("unknown")}</b> date unknown</span>
    <span class="spacer"></span>${bulk}`;

  const sent = reminders();
  $("#cvTable").innerHTML = `<div class="tbl" style="border:0;border-radius:0"><table class="cvtable"><thead><tr><th>Consultant</th><th>Owner email</th><th>Last updated</th><th>Age</th><th>Status</th><th>Reminder</th></tr></thead><tbody>
    ${rows.map(({ d, meta, st }) => {
      const okMail = SAFE_EMAIL.test(meta.email);
      const t = reminderText(meta, st);
      const needs = st.key !== "current";
      const s = sent[d.path];
      return `<tr>
        <td class="person"><b>${esc(meta.name)}</b><span title="${esc(d.path)}">${esc(d.path.split("/").pop())}</span></td>
        <td><input type="email" data-cvemail="${esc(d.path)}" value="${esc(meta.email)}" placeholder="name@company.com" aria-label="Owner email for ${esc(meta.name)}">${meta.emailSource ? `<span class="src">${esc(meta.emailSource)}</span>` : ""}</td>
        <td><input type="date" data-cvdate="${esc(d.path)}" value="${meta.updated ? isoDay(meta.updated) : ""}" max="${isoDay(new Date())}" aria-label="Last updated date for ${esc(meta.name)}">${meta.source ? `<span class="src">${esc(meta.source)}</span>` : `<span class="src">not found, enter it</span>`}</td>
        <td class="age">${esc(ageText(st.months) || "n/a")}</td>
        <td><span class="pill ${st.cls}">${esc(st.label)}</span></td>
        <td><div class="acts">
          <a class="btn small${needs ? " primary" : ""}" data-remind="${esc(d.path)}" href="${okMail ? esc(mailto(meta.email, t.subject, t.body)) : "#"}" aria-disabled="${okMail ? "false" : "true"}">Email reminder</a>
          <button class="btn small" type="button" data-copymsg="${esc(d.path)}">Copy message</button>
        </div>${s ? `<span class="sent">Reminder drafted ${esc(fmtDay(new Date(s)))}</span>` : !okMail ? `<span class="sent">Add an email to send a reminder</span>` : ""}</td>
      </tr>`;
    }).join("")}
  </tbody></table></div>`;
}
$("#cvPolicy").addEventListener("change", e => { store.set("bdCvPolicy", Number(e.target.value)); renderCvCheck(); if (S.current) paintAll(); });
$("#senderName").addEventListener("change", e => { store.set("bdSender", e.target.value.trim()); renderCvCheck(); });
$("#cvTable").addEventListener("change", e => {
  const em = e.target.closest("[data-cvemail]"), dt = e.target.closest("[data-cvdate]");
  if (!em && !dt) return;
  const path = (em || dt).dataset[em ? "cvemail" : "cvdate"], all = cvOverrides(), cur = all[path] || {};
  if (em) { const v = em.value.trim(); if (v && !SAFE_EMAIL.test(v)) { toast("That email address does not look right."); return; } cur.email = v; }
  if (dt) cur.date = dt.value;
  all[path] = cur; store.set("bdCvMeta", all);
  renderCvCheck(); if (S.current) paintAll();
});
$("#cvTable").addEventListener("click", e => {
  const r = e.target.closest("[data-remind]");
  if (r) {
    if (r.getAttribute("aria-disabled") === "true") { e.preventDefault(); toast("Add the owner's email first."); return; }
    const all = reminders(); all[r.dataset.remind] = Date.now(); store.set("bdReminders", all);
    toast("Opening your email app. Check the message, then press Send.");
    setTimeout(renderCvCheck, 300); return;
  }
  const c = e.target.closest("[data-copymsg]");
  if (c) {
    const d = allDocs().find(x => x.path === c.dataset.copymsg); if (!d) return;
    const meta = cvMeta(d), t = reminderText(meta, cvStatus(meta));
    navigator.clipboard.writeText(`Subject: ${t.subject}\n\n${t.body}`).then(() => toast("Message copied. Paste it into Outlook, Teams or WhatsApp."), () => toast("Copy is blocked in this browser."));
  }
});
$("#cvSummary").addEventListener("click", e => { if (e.target.closest("#bulkMail")) toast("Opening your email app with everyone overdue in BCC."); });

/* ---------------- CV vs certificate check ---------------- */
const CERT_HEAD = /^\s*[-•*]?\s*(?:professional\s+)?(?:certifications?|certificates?|accreditations?|registrations?|licen[cs]es?)(?:\s+(?:and|&)\s+[a-z]+)?\s*[:\-]\s*(.*)$/i;
const NEXT_HEAD = /^\s*(?:experience|key projects|projects|skills|key skills|education|qualifications|employment|work history|career|languages|references|summary|profile|memberships|publications|awards)\b[^:\n]{0,30}:/i;
const EXAM_CODE = /\b(?:AZ|DP|PL|AI|MS|SC|MB|MD|SY|CS)-\d{3}\b/gi;
const KNOWN_CERT = /\b(PMP|PRINCE2|CAPM|PMI-ACP|CISSP|CISA|CISM|CRISC|ITIL|TOGAF|CSM|CSPO|CBAP|CFA|COBIT|SAFe)\b/i;
const LEVELS = ["foundation", "practitioner", "associate", "expert", "professional", "specialist", "fundamentals"];
const CERT_STOP = new Set(["microsoft", "certified", "certification", "certificate", "associate", "the", "and", "for", "with", "professional"]);

/** Lists the certifications a CV says the person holds. */
function certClaims(text) {
  const lines = String(text || "").split(/\r?\n/), parts = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(CERT_HEAD); if (!m) continue;
    if (m[1].trim()) parts.push(m[1]);
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (!l.trim()) { if (j > i + 1) break; continue; }
      if (NEXT_HEAD.test(l) || CERT_HEAD.test(l)) break;
      parts.push(l);
    }
  }
  const items = [];
  parts.join("\n").split(/\n|;|•/).forEach(chunk =>
    chunk.split(/(?<=[)\d])\.\s+|\.\s+(?=[A-Z])/).forEach(x => {
      const t = x.replace(/^[\s\-*]+|[\s.,]+$/g, "");
      if (t.length >= 2 && !/^(no|none|not)\b/i.test(t)) items.push(t);
    }));
  const seen = new Set(), out = [];
  for (const t of items) {
    const c = claimInfo(t); if (seen.has(c.key)) continue; seen.add(c.key); out.push(c);
  }
  for (const code of (String(text || "").match(EXAM_CODE) || [])) {
    const k = code.toUpperCase(); if (seen.has(k)) continue; seen.add(k);
    out.push({ text: `${k} (mentioned in the CV)`, code: k, key: k, year: null });
  }
  return out;
}
function claimInfo(t) {
  const exam = (t.match(EXAM_CODE) || [])[0], known = (t.match(KNOWN_CERT) || [])[0];
  const code = exam ? exam.toUpperCase() : known ? known.toUpperCase() : null;
  const year = (t.match(/\b(19|20)\d{2}\b/) || [])[0] || null;
  const level = LEVELS.find(l => new RegExp("\\b" + l + "\\b", "i").test(t)) || null;
  return { text: t, code, year, level: code && !exam ? level : null, key: code ? code + (level && !exam ? " " + level : "") : norm(t) };
}
/** The person a certificate belongs to, if the file says. */
function certHolder(doc) {
  const m = String(doc.text || "").match(/(?:holder|awarded to|issued to|name|this is to certify that)\s*[:\-]?\s*([A-Za-z][A-Za-z .'-]{2,60})/i);
  return m ? m[1].trim().replace(/\s+(has|is|was)\b.*$/i, "") : "";
}
function belongsTo(doc, name) {
  const n = norm(name); if (!n) return false;
  const h = norm(certHolder(doc));
  if (h) return h === n || h.includes(n) || n.includes(h);
  return norm(doc.path).includes(n) || norm(doc.text.slice(0, 800)).includes(n);
}
function claimMatches(claim, doc) {
  const hay = norm(doc.path + " " + doc.text);
  if (claim.code) {
    if (!hay.includes(norm(claim.code))) return false;
    if (claim.level) { const other = LEVELS.filter(l => l !== claim.level && hay.includes(l)); if (other.length && !hay.includes(claim.level)) return false; }
    return true;
  }
  const words = norm(claim.text).split(" ").filter(w => w.length > 2 && !CERT_STOP.has(w) && !/^\d+$/.test(w));
  if (!words.length) return false;
  return words.filter(w => hay.includes(w)).length / words.length >= 0.6;
}
const certLinks = () => store.get("bdCertLinks", {});

/** Compares each CV's listed certifications with the certificate files in the folder. */
function certReport() {
  const docs = allDocs(), certs = docs.filter(d => d.kind === "cert"), links = certLinks();
  const people = docs.filter(d => d.kind === "cv").map(cv => {
    const meta = cvMeta(cv), mine = certs.filter(d => belongsTo(d, meta.name)), used = new Set();
    const claims = certClaims(cv.text).map(cl => {
      const lk = links[cv.path + "::" + cl.key];
      let doc = lk ? findDoc(lk) : null, how = doc ? "linked by you" : "";
      if (!doc) { doc = mine.find(d => claimMatches(cl, d)) || null; if (doc) how = "matched by name and certification"; }
      if (doc) used.add(doc.path);
      const exp = doc ? expiryInfo(doc, null) : null;
      const status = !doc ? { key: "missing", cls: "bad", label: "No proof in folder" }
        : exp.key === "expired" ? { key: "expired", cls: "bad", label: exp.label }
        : exp.key === "soon" ? { key: "soon", cls: "warn", label: exp.label }
        : exp.key === "valid" ? { key: "ok", cls: "ok", label: exp.label }
        : { key: "ok", cls: "ok", label: "Proof found (no expiry date)" };
      return { ...cl, doc, how, status };
    });
    const extra = mine.filter(d => !used.has(d.path)).map(d => ({ doc: d, exp: expiryInfo(d, null) }));
    return { cv, meta, claims, extra };
  });
  const all = people.flatMap(p => p.claims);
  return {
    people,
    totals: {
      claims: all.length,
      ok: all.filter(c => c.status.key === "ok").length,
      missing: all.filter(c => c.status.key === "missing").length,
      expired: all.filter(c => c.status.key === "expired").length,
      soon: all.filter(c => c.status.key === "soon").length,
      extra: people.reduce((n, p) => n + p.extra.length, 0),
    },
  };
}

function certRequestText(p) {
  const first = p.meta.name.split(/\s+/)[0] || "there";
  const due = fmtDay(new Date(Date.now() + 14 * DAY));
  const sender = String(store.get("bdSender", "") || "").trim();
  const missing = p.claims.filter(c => c.status.key === "missing").map(c => `- ${c.text} (no copy on file)`);
  const expired = p.claims.filter(c => c.status.key === "expired" || c.status.key === "soon").map(c => `- ${c.text} (${lowerFirst(c.status.label)}, please send the renewed certificate)`);
  const extra = p.extra.map(x => `- ${certTitle(x.doc)}`);
  const subject = "Please send copies of your certificates for tender submissions";
  let body = `Hi ${first},

For tender submissions we need a copy of each certificate listed on your CV.`;
  if (missing.length || expired.length) body += `

We need these:
${[...missing, ...expired].join("\n")}

Please send a PDF copy of each by ${due}. If a certification has lapsed, tell me so we can update your CV.`;
  if (extra.length) body += `

We also have these certificates on file, but they are not on your CV. Please add them when you next update it:
${extra.join("\n")}`;
  body += `

Thank you.

${sender || "[Your name]"}`;
  return { subject, body };
}
function certTitle(doc) {
  const m = String(doc.text || "").match(/certification\s*:\s*([^\n]+)/i);
  return m ? m[1].trim() : baseName(doc.path).replace(/\.[^.]+$/, "");
}
function renderCertCheck() {
  const r = certReport(), t = r.totals, onlyProblems = Boolean(store.get("bdCertProblems", false));
  const badge = $("#certDue"), bad = t.missing + t.expired;
  badge.textContent = bad; badge.classList.toggle("zero", !bad);
  $("#certProblems").checked = onlyProblems;
  if (!r.people.length) {
    $("#certSummary").innerHTML = "";
    $("#certList").innerHTML = `<p class="emptybig">No CVs found. Turn on the demo repository, open a folder, or add CVs in the Document folder tab.</p>`;
    return;
  }
  $("#certSummary").innerHTML = `
    <span class="count"><b>${t.claims}</b> listed in CVs</span>
    <span class="count ok"><b>${t.ok}</b> proof found</span>
    <span class="count bad"><b>${t.missing}</b> no proof in folder</span>
    <span class="count bad"><b>${t.expired}</b> expired</span>
    <span class="count warn"><b>${t.soon}</b> expiring soon</span>
    <span class="count warn"><b>${t.extra}</b> on file, not in CV</span>`;
  const allCerts = allDocs().filter(d => d.kind === "cert");
  const people = r.people.filter(p => !onlyProblems || p.extra.length || p.claims.some(c => c.status.key !== "ok"));
  if (!people.length) { $("#certList").innerHTML = `<p class="emptybig">No problems found. Every certificate listed in the CVs has a valid copy on file.</p>`; return; }
  $("#certList").innerHTML = people.map(p => {
    const probs = p.claims.filter(c => c.status.key !== "ok").length + p.extra.length;
    const okMail = SAFE_EMAIL.test(p.meta.email), tx = certRequestText(p);
    const rows = p.claims.filter(c => !onlyProblems || c.status.key !== "ok").map(c => `<tr>
        <td>${esc(c.text)}${c.code ? `<span class="evnote">${esc(c.code)}${c.year ? ` · ${esc(c.year)}` : ""}</span>` : ""}</td>
        <td>${c.doc ? `${fileChip(c.doc.path)}<span class="evnote">${esc(c.how)}</span>` : `<select class="kindsel" data-certlink="${esc(p.cv.path + "::" + c.key)}" aria-label="Link a certificate file for ${esc(c.text)}"><option value="">Link a file...</option>${allCerts.map(d => `<option value="${esc(d.path)}">${esc(baseName(d.path))}</option>`).join("")}</select>`}</td>
        <td><span class="pill ${c.status.cls}">${esc(c.status.label)}</span>${c.how === "linked by you" ? ` <button class="btn link" type="button" data-certunlink="${esc(p.cv.path + "::" + c.key)}">Unlink</button>` : ""}</td>
      </tr>`).join("");
    const extras = p.extra.map(x => `<tr>
        <td>${esc(certTitle(x.doc))}<span class="evnote">On file, not listed in the CV</span></td>
        <td>${fileChip(x.doc.path)}</td>
        <td><span class="pill warn">Add to CV</span></td>
      </tr>`).join("");
    return `<section class="evcard certcard">
      <div class="evhead"><b>${esc(p.meta.name)}</b><span>${fileChip(p.cv.path)} ${probs ? `<span class="pill bad">${probs} to fix</span>` : `<span class="pill ok">All proof on file</span>`}</span></div>
      ${p.claims.length || p.extra.length ? `<div class="tbl" style="border:0;border-radius:0"><table><thead><tr><th>Certification in CV</th><th>Proof in folder</th><th>Status</th></tr></thead><tbody>${rows}${extras}</tbody></table></div>`
        : `<div class="evrow"><span class="evnote">No certifications are listed in this CV.</span></div>`}
      ${probs ? `<div class="evrow" style="grid-template-columns:1fr"><div class="acts row">
        <a class="btn small primary" data-certmail="1" href="${okMail ? esc(mailto(p.meta.email, tx.subject, tx.body)) : "#"}" aria-disabled="${okMail ? "false" : "true"}">Request missing certificates</a>
        <button class="btn small" type="button" data-certcopy="${esc(p.cv.path)}">Copy message</button>
        ${okMail ? "" : `<span class="evnote">Add this person's email in the CV check tab to send a request.</span>`}
      </div></div>` : ""}
    </section>`;
  }).join("");
}
$("#certProblems").addEventListener("change", e => { store.set("bdCertProblems", e.target.checked); renderCertCheck(); });
$("#certList").addEventListener("change", e => {
  const s = e.target.closest("[data-certlink]"); if (!s || !s.value) return;
  const all = certLinks(); all[s.dataset.certlink] = s.value; store.set("bdCertLinks", all);
  toast("Certificate linked"); renderCertCheck();
});
$("#certList").addEventListener("click", e => {
  const u = e.target.closest("[data-certunlink]");
  if (u) { const all = certLinks(); delete all[u.dataset.certunlink]; store.set("bdCertLinks", all); renderCertCheck(); return; }
  const m = e.target.closest("[data-certmail]");
  if (m) { if (m.getAttribute("aria-disabled") === "true") { e.preventDefault(); toast("Add the person's email in the CV check tab first."); } else toast("Opening your email app. Check the message, then press Send."); return; }
  const c = e.target.closest("[data-certcopy]");
  if (c) {
    const p = certReport().people.find(x => x.cv.path === c.dataset.certcopy); if (!p) return;
    const tx = certRequestText(p);
    navigator.clipboard.writeText(`Subject: ${tx.subject}\n\n${tx.body}`).then(() => toast("Message copied. Paste it into Outlook, Teams or WhatsApp."), () => toast("Copy is blocked in this browser."));
  }
});

/** Finds the CV document behind a skills-match candidate. */
function docForCandidate(cd) {
  const cvs = allDocs().filter(d => d.kind === "cv");
  const f = String(cd.file || ""), base = f.split("/").pop().toLowerCase(), nm = String(cd.name || "").toLowerCase().trim();
  return cvs.find(d => d.path === f) || (base && cvs.find(d => d.path.toLowerCase().endsWith(base))) || (nm && cvs.find(d => d.title.toLowerCase().includes(nm)));
}
function staleTag(cd) {
  const d = docForCandidate(cd); if (!d) return "";
  const st = cvStatus(cvMeta(d));
  if (st.key === "overdue") return `<span class="tagc stale">CV out of date: last updated ${esc(ageText(st.months))} ago</span>`;
  if (st.key === "due") return `<span class="tagc gap">CV due for update soon (${esc(ageText(st.months))} old)</span>`;
  if (st.key === "unknown") return `<span class="tagc gap">CV has no update date</span>`;
  return "";
}

/* ---------------- shortlist (keyword scan, runs in the browser) ---------------- */
function shortlist(docs, terms, limit) {
  const ts = [...new Set(arr(terms).map(t => String(t).toLowerCase().trim()).filter(t => t.length > 1))];
  const scored = docs.map(d => {
    const tx = (d.path + " " + d.text).toLowerCase(); let score = 0; const hits = [];
    for (const t of ts) { let c = 0, i = tx.indexOf(t); while (i !== -1 && c < 30) { c++; i = tx.indexOf(t, i + t.length); } if (c) { score += Math.log2(1 + c) * (t.includes(" ") ? 2 : 1); hits.push(t); } }
    return { d, score, hits };
  }).sort((a, b) => b.score - a.score);
  return { picked: scored.slice(0, limit), total: docs.length };
}
const forSend = (docs, budget) => { const per = Math.max(1500, Math.floor(budget / Math.max(1, docs.length))); return docs.map(d => ({ path: d.path, text: clip(d.text, per) })); };

/* ---------------- board ---------------- */
const STEPS = [
  { id: "info", title: "Key information from the tender" },
  { id: "cv", title: "Skills match from CVs" },
  { id: "work", title: "Past work that supports the bid" },
  { id: "evidence", title: "Evidence pack for the submission" },
];
const STATUS = { waiting: "Waiting", working: "Working", done: "Done", error: "Failed", stopped: "Stopped", skipped: "Skipped" };
function renderOutline() {
  $("#board").innerHTML = `<div class="box outline"><p class="eyebrow">How it works</p><h2>From tender to evidence pack in four steps</h2>
  <p class="note" style="margin-top:6px">Load a tender, choose where to search, then press Analyse. Anything the documents do not show is marked "${NA}" instead of being guessed.</p>
  <ol class="flow">
    <li><b>Extract key information</b><span>Client, deadline, mandatory items, scoring, the roles and the previous work the client asks for.</span></li>
    <li><b>Match skills from CVs</b><span>Ranks consultants for each role with a match score, what they meet, and their gaps.</span></li>
    <li><b>Find supporting past work</b><span>Scans the folder for projects and reference letters that prove each experience requirement.</span></li>
    <li><b>Build the evidence pack</b><span>Links the right CV, certificates and proof of similar work to each requirement, and flags anything missing or expired.</span></li>
  </ol></div>`;
}
function renderBoard() {
  const c = S.current; if (!c) return renderOutline();
  $("#board").innerHTML = `
    <div class="box"><div class="boardhead">
      <div class="t"><p class="eyebrow">Tender analysis</p><h2>${esc(c.title)}</h2><div class="sub">${esc(c.rfpName || "Pasted tender")} · ${fmtDate(c.createdAt)} · searched: ${esc(c.sourcesLabel || "")}</div></div>
      <div class="row"><button class="btn small" id="copyMd" type="button">Copy as text</button><button class="btn small" data-dl="md" type="button">Download .md</button><button class="btn small" data-dl="html" type="button">Download .html</button></div>
    </div></div>
    ${STEPS.map((s, i) => `<article class="box step" id="step-${s.id}"><div class="stephead"><span class="num">${i + 1}</span><h3>${esc(s.title)}</h3><span class="status" data-st></span></div><div class="stepbody" data-body></div></article>`).join("")}`;
  STEPS.forEach(s => paint(s.id));
}
function paint(id) {
  const c = S.current, el = $("#step-" + id); if (!c || !el) return;
  const st = c.steps[id];
  el.querySelector("[data-st]").className = "status st-" + st.status;
  el.querySelector("[data-st]").innerHTML = `<span class="s"></span>${esc(STATUS[st.status])}`;
  let html = "";
  if (st.data) html = ({ info: viewInfo, cv: viewCv, work: viewWork, evidence: viewEvidence })[id](st.data, st);
  else if (st.status === "working") html = `<p class="waiting">${esc(st.progress || "Working...")}</p>`;
  else if (st.status === "waiting") html = `<p class="waiting">${id === "evidence" ? "Starts when steps 2 and 3 are done." : "Starts when step 1 is done."}</p>`;
  else if (st.status === "skipped") html = `<p class="waiting">${esc(st.note || "Skipped.")}</p>`;
  if (["error", "stopped"].includes(st.status) && !S.running)
    html += `<div class="err"><span>${esc(st.status === "stopped" ? "You stopped this step." : st.error || errCopy())}</span><button class="btn small" data-rerun="${id}" type="button">Run this step again</button></div>`;
  el.querySelector("[data-body]").innerHTML = window.DOMPurify.sanitize(html);
}
function fact(label, v, extra = "") { return `<div class="fact"><dt>${esc(label)}</dt><dd class="${isNA(v) ? "na" : ""}">${esc(str(v))}${extra}</dd></div>`; }
function viewInfo(x) {
  let cd = "";
  if (x.submissionDeadlineISO && /^\d{4}-\d{2}-\d{2}/.test(x.submissionDeadlineISO)) {
    const days = Math.ceil((new Date(x.submissionDeadlineISO + "T23:59:59") - new Date()) / 864e5);
    cd = `<br><span class="countdown ${days < 0 ? "late" : ""}">${days < 0 ? "Closed" : days === 0 ? "Closes today" : `${days} days left`}</span>`;
  }
  const maxPts = Math.max(1, ...arr(x.evaluation).map(e => Number(e.points) || 0));
  return `
  ${x.summary ? `<p class="lead">${esc(x.summary)}</p>` : ""}
  <dl class="facts" style="margin:0">
    ${fact("Client", x.client)}${fact("Project", x.project)}${fact("Reference", x.reference)}${fact("Industry", x.industry)}
    ${fact("Closing date", x.submissionDeadline, cd)}${fact("Briefing session", x.briefingSession)}${fact("Contract duration", x.contractDuration)}${fact("Submission", x.submissionMethod)}
  </dl>
  ${arr(x.mandatory).length ? `<div class="sec"><h4>Mandatory requirements</h4><div class="tbl"><table><thead><tr><th>ID</th><th>Requirement</th><th>Proof needed</th><th>If missed</th></tr></thead><tbody>
    ${arr(x.mandatory).map(m => `<tr><td class="id">${esc(m.id)}</td><td>${esc(m.requirement)}</td><td>${esc(str(m.evidence))}</td><td>${m.disqualifying ? `<span class="pill bad">Disqualified</span>` : `<span class="pill na">Scored</span>`}</td></tr>`).join("")}
  </tbody></table></div></div>` : ""}
  ${arr(x.evaluation).length ? `<div class="sec"><h4>How bids are scored</h4><div class="tbl"><table><thead><tr><th>Stage</th><th>Criterion</th><th>Points</th><th>Detail</th></tr></thead><tbody>
    ${arr(x.evaluation).map(e => `<tr><td>${esc(str(e.stage))}</td><td>${esc(e.criterion)}</td><td>${Number(e.points) ? `<div class="wbar"><i style="width:${Math.round(70 * Number(e.points) / maxPts)}px"></i><span>${esc(e.points)}</span></div>` : "<span class='pill na'>n/a</span>"}</td><td>${esc(e.detail || "")}</td></tr>`).join("")}
  </tbody></table></div>${arr(x.thresholds).length ? `<p class="note" style="margin-top:8px">Thresholds: ${esc(arr(x.thresholds).join("; "))}</p>` : ""}</div>` : ""}
  ${arr(x.roles).length ? `<div class="sec"><h4>Roles the client asks for</h4><div class="tbl"><table><thead><tr><th>Role</th><th>Qualifications</th><th>Certifications</th><th>Min. years</th><th>Experience</th></tr></thead><tbody>
    ${arr(x.roles).map(r => `<tr><td><b>${esc(r.role)}</b></td><td>${esc(arr(r.qualifications).join("; ") || NA)}</td><td>${esc(arr(r.certifications).join("; ") || NA)}</td><td>${esc(r.minYears ?? NA)}</td><td>${esc([...arr(r.experience), ...arr(r.skills)].join("; ") || NA)}</td></tr>`).join("")}
  </tbody></table></div></div>` : ""}
  <div class="sec"><h4>Previous work the client asks for</h4>${arr(x.experienceRequirements).length ? `<ul class="plain">${arr(x.experienceRequirements).map(r => `<li><b>${esc(r.id)}</b> ${esc(r.requirement)}</li>`).join("")}</ul>` : `<p class="waiting">The tender does not ask for previous work.</p>`}</div>
  ${arr(x.deliverables).length ? `<div class="sec"><h4>Key deliverables</h4><ul class="plain">${arr(x.deliverables).map(d => `<li>${esc(d)}</li>`).join("")}</ul></div>` : ""}
  ${arr(x.notStated).length ? `<div class="sec"><h4>Not stated in the tender</h4><ul class="plain">${arr(x.notStated).map(d => `<li>${esc(d)}</li>`).join("")}</ul></div>` : ""}`;
}
function viewCv(x, st) {
  const roles = arr(x.roles);
  if (!roles.length) return `<p class="waiting">No roles to match.</p>`;
  return `${st.scanNote ? `<div class="scan">${st.scanNote}</div>` : ""}<div class="roles">${roles.map(r => `
    <section class="role"><div class="rolehead"><h3>${esc(r.role)}</h3>${r.requirementSummary ? `<p>${esc(r.requirementSummary)}</p>` : ""}</div>
    ${arr(r.candidates).length ? arr(r.candidates).map(cd => { const m = Math.max(0, Math.min(100, Number(cd.match) || 0)); return `
      <div class="cand"><div class="top"><span class="nm">${esc(cd.name)}</span>${pill(cd.confidence)}<span class="file">${esc(cd.file || "")}</span>
        <div class="meter"><div class="bar"><i style="width:${m}%"></i></div><b>${m}%</b></div></div>
        <div class="tags">${staleTag(cd)}${arr(cd.meets).map(t => `<span class="tagc meets">${esc(t)}</span>`).join("")}${arr(cd.gaps).map(t => `<span class="tagc gap">Gap: ${esc(t)}</span>`).join("")}</div>
        ${cd.summary ? `<p>${esc(cd.summary)}</p>` : ""}</div>`; }).join("") : `<div class="nomatch">No suitable CV found in the folder.</div>`}
    ${r.recommendation ? `<div class="rolerec"><b>Recommendation:</b> ${esc(r.recommendation)}</div>` : ""}</section>`).join("")}</div>`;
}
function viewWork(x, st) {
  return `${st.scanNote ? `<div class="scan">${st.scanNote}</div>` : ""}<div class="reqs">${arr(x.requirements).map(r => `
    <section class="req"><div class="reqhead"><span class="id">${esc(r.id || "")}</span><div class="txt"><b>${esc(r.requirement)}</b><span>${esc(r.explanation || "")}</span></div>${pill(r.verdict)}</div>
    ${arr(r.matches).length ? arr(r.matches).map(mm => `
      <div class="doc"><div class="path">${esc(mm.file)}</div>
        <div class="meta"><span><b>${esc(str(mm.client))}</b></span><span>${esc(str(mm.year))}</span><span>${esc(str(mm.value))}</span><span>Relevance ${pill(mm.relevance)}</span></div>
        ${mm.why ? `<p>${esc(mm.why)}</p>` : ""}
        <div class="checks">${arr(mm.checks).map(ck => `<span class="pill ${pillFor(ck.result)}">${esc(ck.rule)}: ${esc(ck.result)}</span>`).join("")}${mm.referenceLetter && mm.referenceLetter !== "Not needed" ? `<span class="pill ${pillFor(mm.referenceLetter)}">Reference letter: ${esc(mm.referenceLetter)}</span>` : ""}</div>
        ${mm.letterFile ? `<div class="path">${esc(mm.letterFile)}</div>` : ""}
      </div>`).join("") : `<div class="nomatch">No supporting documents found in the folder.</div>`}
    ${r.action ? `<div class="rolerec"><b>Next step:</b> ${esc(r.action)}</div>` : ""}</section>`).join("")}</div>`;
}

/* ---------------- running ---------------- */
function setRunning(on) { S.running = on; $("#stopBtn").hidden = !on; $("#runBtn").textContent = on ? "Analysing..." : "Analyse tender"; renderSources(); }
async function ask(task, payload) {
  const ctl = new AbortController(); S.ctls.push(ctl);
  const j = await api("/api/analyze", { task, ...payload }, ctl.signal);
  return j.result;
}
const paintAll = () => STEPS.forEach(s => paint(s.id));
function fail(step, e) { step.status = e && e.code === "cancelled" ? "stopped" : "error"; step.error = errCopy(e && e.code); }

async function stepInfo() {
  const st = S.current.steps.info;
  st.status = "working"; st.progress = "Reading the tender. This usually takes under a minute."; st.data = null; paint("info");
  try {
    const d = await ask("extract", { tender: clip($("#rfpText").value.trim(), 220000), tenderName: S.rfpName || "pasted text" });
    if (!d || typeof d !== "object") throw { code: "invalid_json" };
    st.data = d; st.status = "done"; return true;
  } catch (e) { fail(st, e); return false; } finally { paint("info"); }
}
async function stepCv() {
  const c = S.current, st = c.steps.cv, info = c.steps.info.data;
  if (!arr(info.roles).length) { st.status = "skipped"; st.note = "The tender does not name any roles, so there is nothing to match."; paint("cv"); return; }
  let cvs = c.docs.filter(d => d.kind === "cv");
  if (!cvs.length) { st.status = "skipped"; st.note = "No CVs in the selected folder."; paint("cv"); return; }
  let note = `Checked <b>${cvs.length}</b> CVs against <b>${arr(info.roles).length}</b> roles.`;
  if (cvs.length > 30) {
    const terms = arr(info.roles).flatMap(r => [r.role, ...arr(r.certifications), ...arr(r.skills), ...arr(r.qualifications)]);
    const sl = shortlist(cvs, terms, 30);
    cvs = sl.picked.map(p => p.d); note = `Scanned <b>${sl.total}</b> CVs, shortlisted the <b>30</b> closest for detailed matching.`;
  }
  st.status = "working"; st.progress = `Comparing ${cvs.length} CVs with ${arr(info.roles).length} roles...`; st.data = null; paint("cv");
  try {
    const d = await ask("cv", { roles: info.roles, docs: forSend(cvs, 160000) });
    if (!d || !Array.isArray(d.roles)) throw { code: "invalid_json" };
    st.data = d; st.scanNote = note; st.status = "done";
  } catch (e) { fail(st, e); } finally { paint("cv"); }
}
async function stepWork() {
  const c = S.current, st = c.steps.work, info = c.steps.info.data;
  let reqs = arr(info.experienceRequirements);
  const projects = c.docs.filter(d => d.kind === "project"), letters = c.docs.filter(d => d.kind === "letter");
  if (!projects.length) { st.status = "skipped"; st.note = "No past project documents in the selected folder."; paint("work"); return; }
  let extra = "";
  if (!reqs.length) { reqs = [{ id: "EXP-01", requirement: "Similar previous work that shows we can deliver this scope (the tender does not ask for references, so this supports the methodology)" }]; extra = "<br>The tender does not ask for previous work, so this search looks for similar work to support the bid."; }
  const terms = [...arr(info.searchTerms), ...arr(info.deliverables).flatMap(d => String(d).split(/[,;]/)), info.industry || ""].filter(Boolean);
  const sl = shortlist(projects, terms, 15);
  const picked = sl.picked.map(p => p.d), letterPick = letters.slice(0, 15);
  const top = sl.picked.slice(0, 5).map(p => `${esc(p.d.path.split("/").pop())} (${p.hits.length} matching terms)`).join("<br>");
  st.status = "working"; st.progress = `Scanned ${sl.total} project documents and ${letters.length} letters. Checking the ${picked.length} closest against ${reqs.length} requirement${reqs.length > 1 ? "s" : ""}...`; st.data = null; paint("work");
  try {
    const d = await ask("work", { reqs, summary: info.summary || "", deliverables: arr(info.deliverables), docs: forSend([...picked, ...letterPick], 170000) });
    if (!d || !Array.isArray(d.requirements)) throw { code: "invalid_json" };
    st.data = d; st.status = "done";
    st.scanNote = `Scanned <b>${sl.total}</b> project documents and <b>${letters.length}</b> reference letters. Shortlisted the <b>${picked.length}</b> closest by keyword for a detailed check.${top ? `<br>Top keyword hits:<br>${top}` : ""}${extra}`;
  } catch (e) { fail(st, e); } finally { paint("work"); }
}
/* ---------------- step 4: evidence pack ---------------- */
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const baseName = p => String(p || "").split("/").pop();
const lowerFirst = t => String(t || "").charAt(0).toLowerCase() + String(t || "").slice(1);
function findDoc(path) {
  if (!path) return null;
  const docs = allDocs(), b = baseName(path).toLowerCase();
  return docs.find(d => d.path === path) || docs.find(d => baseName(d.path).toLowerCase() === b) || null;
}
/** Reads an expiry or "valid until" date from a certificate's text. */
function certExpiry(text) {
  const re = /(?:expires|expiry(?:\s+date)?|valid\s+until|valid\s+to|expiration(?:\s+date)?)\s*(?:on)?\s*[:\-]?\s*([^\n|;]{4,30})/gi;
  let m; while ((m = re.exec(String(text || "")))) { const d = parseDateText(m[1]); if (d) return d; }
  return null;
}
function expiryInfo(doc, deadline) {
  const exp = doc && certExpiry(doc.text);
  if (!exp) return { cls: "na", label: "No expiry date", key: "none" };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (exp < today) return { cls: "bad", label: `Expired ${fmtDay(exp)}`, key: "expired" };
  if (deadline && exp < deadline) return { cls: "bad", label: `Expires ${fmtDay(exp)}, before the closing date`, key: "beforeDeadline" };
  if (exp - today < 60 * DAY) return { cls: "warn", label: `Expires ${fmtDay(exp)}`, key: "soon" };
  return { cls: "ok", label: `Valid until ${fmtDay(exp)}`, key: "valid" };
}
function fileChip(path) {
  const d = findDoc(path), name = baseName(path);
  return d ? `<button class="filechip" type="button" data-view="${esc(d.path)}" title="${esc(d.path)}">${esc(name)}</button>`
           : `<span class="filechip off" title="Not in the loaded folder: ${esc(path)}">${esc(name)}</span>`;
}

/** Puts steps 1 to 4 together into one checklist. Used by the screen and the download. */
function buildPack(c) {
  const info = c.steps.info.data || {}, ev = c.steps.evidence.data || {};
  const deadline = info.submissionDeadlineISO && /^\d{4}-\d{2}-\d{2}/.test(info.submissionDeadlineISO) ? new Date(info.submissionDeadlineISO + "T23:59:59") : null;
  const evPeople = arr(ev.people);
  const personnel = arr(c.steps.cv.data && c.steps.cv.data.roles).map(r => {
    const cd = arr(r.candidates)[0];
    if (!cd) return { role: r.role, name: null, cv: null, certs: [] };
    const cvDoc = docForCandidate(cd), meta = cvDoc && cvMeta(cvDoc), st = meta && cvStatus(meta);
    const p = evPeople.find(x => norm(x.role) === norm(r.role)) || evPeople.find(x => norm(x.name) === norm(cd.name));
    const certs = arr(p && p.certs).map(ct => {
      const doc = ct.file ? findDoc(ct.file) : null;
      return { required: ct.required, status: ct.status, file: ct.file, note: ct.note, expiry: ct.status === "Found" && doc ? expiryInfo(doc, deadline) : null };
    });
    return { role: r.role, name: cd.name, match: cd.match, cv: cvDoc ? { path: cvDoc.path, st } : { path: cd.file, st: null }, certs };
  });
  const experience = arr(c.steps.work.data && c.steps.work.data.requirements).map(r => ({
    id: r.id, requirement: r.requirement, verdict: r.verdict, action: r.action,
    items: arr(r.matches).map(m => ({ file: m.file, project: m.project || baseName(m.file), relevance: m.relevance, letter: m.referenceLetter, letterFile: m.letterFile })),
  }));
  const mandatory = arr(ev.mandatory).map(m => ({
    id: m.id, requirement: m.requirement, status: m.status, note: m.note,
    files: arr(m.files).map(f => ({ path: f, expiry: expiryInfo(findDoc(f), deadline) })),
  }));
  const linked = new Set(), issues = [];
  personnel.forEach(p => {
    if (!p.name) { issues.push(`${p.role}: no suitable CV`); return; }
    if (p.cv && p.cv.path) linked.add(p.cv.path);
    if (p.cv && p.cv.st && p.cv.st.key === "overdue") issues.push(`${p.name}: CV out of date`);
    p.certs.forEach(ct => {
      if (ct.status === "Missing") issues.push(`${p.name}: ${ct.required} certificate missing`);
      if (ct.file && ct.status === "Found") linked.add(ct.file);
      if (ct.expiry && ["expired", "beforeDeadline", "soon"].includes(ct.expiry.key)) issues.push(`${p.name}: ${ct.required} ${lowerFirst(ct.expiry.label)}`);
    });
  });
  experience.forEach(e => {
    e.items.forEach(i => { linked.add(i.file); if (i.letterFile) linked.add(i.letterFile); if (i.letter === "Not found") issues.push(`${i.project}: reference letter missing`); });
    if (e.verdict && e.verdict !== "Met") issues.push(`${e.id || "Experience"}: ${e.verdict.toLowerCase()}`);
  });
  mandatory.forEach(m => {
    m.files.forEach(f => linked.add(f.path));
    if (m.status === "Missing") issues.push(`${m.id}: ${m.requirement} (missing)`);
    m.files.forEach(f => { if (["expired", "beforeDeadline"].includes(f.expiry.key)) issues.push(`${m.id}: ${baseName(f.path)} ${lowerFirst(f.expiry.label)}`); });
  });
  return { personnel, experience, mandatory, linked: [...linked].filter(Boolean), issues, deadline };
}

async function stepEvidence() {
  const c = S.current, st = c.steps.evidence, info = c.steps.info.data;
  if (!info) { st.status = "skipped"; st.note = "Skipped because step 1 did not finish."; paint("evidence"); return; }
  const people = arr(c.steps.cv.data && c.steps.cv.data.roles).map(r => {
    const cd = arr(r.candidates)[0]; if (!cd) return null;
    const req = arr(info.roles).find(x => norm(x.role) === norm(r.role)) || arr(info.roles).find(x => norm(r.role).includes(norm(x.role)) || norm(x.role).includes(norm(r.role)));
    return { role: r.role, name: cd.name, certifications: arr(req && req.certifications) };
  }).filter(Boolean);
  const mandatory = arr(info.mandatory).map(m => ({ id: m.id, requirement: m.requirement, evidence: m.evidence }));
  const certDocs = (c.docs || allDocs()).filter(d => d.kind === "cert");
  const needAi = mandatory.length || people.some(p => p.certifications.length);
  st.status = "working"; st.data = null;
  st.progress = `Matching ${certDocs.length} certificates and compliance documents to ${mandatory.length} mandatory items and ${people.length} people...`;
  paint("evidence");
  try {
    let d;
    if (!needAi) d = { mandatory: [], people: [] };
    else if (!certDocs.length) d = {
      mandatory: mandatory.map(m => ({ id: m.id, requirement: m.requirement, status: /attend|briefing|site visit|meeting|presentation/i.test(m.requirement) ? "Not a document" : "Missing", files: [], note: "No certificate or compliance documents in the folder." })),
      people: people.map(p => ({ role: p.role, name: p.name, certs: p.certifications.map(x => ({ required: x, status: "Missing", file: null, note: "No certificates in the folder." })) })),
    };
    else {
      d = await ask("evidence", { mandatory, people, docs: forSend(certDocs, 60000) });
      if (!d || typeof d !== "object") throw { code: "invalid_json" };
    }
    st.data = { mandatory: arr(d.mandatory), people: arr(d.people) }; st.status = "done";
  } catch (e) { fail(st, e); } finally { paint("evidence"); }
}

function viewEvidence(x, st) {
  const c = S.current, pack = buildPack(c);
  const okIcon = v => pill(v === "Not a document" ? "Action" : v);
  const persons = pack.personnel.map(p => `
    <section class="evcard"><div class="evhead"><b>${esc(p.role)}</b>${p.name ? `<span>${esc(p.name)}${p.match != null ? ` · ${esc(p.match)}% match` : ""}</span>` : `<span class="pill bad">No suitable CV</span>`}</div>
    ${p.name ? `<div class="evrow"><span class="evlabel">CV</span><div class="evfiles">${p.cv && p.cv.path ? fileChip(p.cv.path) : `<span class="pill bad">CV file not found</span>`}${p.cv && p.cv.st ? `<span class="pill ${p.cv.st.cls}">${esc(p.cv.st.key === "unknown" ? "No update date" : `${p.cv.st.label}, ${ageText(p.cv.st.months)} old`)}</span>` : ""}</div></div>` : ""}
    ${p.certs.map(ct => `<div class="evrow"><span class="evlabel">${esc(ct.required)}</span><div class="evfiles">${ct.status === "Found" && ct.file ? fileChip(ct.file) : ""}${ct.status === "Found" ? (ct.expiry ? `<span class="pill ${ct.expiry.cls}">${esc(ct.expiry.label)}</span>` : "") : okIcon(ct.status)}${ct.note && ct.status !== "Found" ? `<span class="evnote">${esc(ct.note)}</span>` : ""}</div></div>`).join("")}
    ${p.name && !p.certs.length ? `<div class="evrow"><span class="evlabel">Certificates</span><div class="evfiles"><span class="evnote">The tender names no certification for this role.</span></div></div>` : ""}
    </section>`).join("");
  const exp = pack.experience.map(e => `
    <section class="evcard"><div class="evhead"><b>${esc(e.id || "")} ${esc(e.requirement)}</b>${pill(e.verdict)}</div>
    ${e.items.length ? e.items.map(i => `<div class="evrow"><span class="evlabel">${esc(i.project)}</span><div class="evfiles">${fileChip(i.file)}${i.letterFile ? fileChip(i.letterFile) : ""}${i.letter === "Not found" ? `<span class="pill bad">Reference letter missing</span>` : i.letter === "Found" ? `<span class="pill ok">Letter found</span>` : ""}</div></div>`).join("") : `<div class="evrow"><span class="evnote">No supporting documents found.</span></div>`}
    ${e.action ? `<div class="evrow"><span class="evnote"><b>Next step:</b> ${esc(e.action)}</span></div>` : ""}</section>`).join("");
  const mand = pack.mandatory.length ? `<div class="tbl"><table><thead><tr><th>ID</th><th>Requirement</th><th>Status</th><th>Linked documents</th></tr></thead><tbody>
    ${pack.mandatory.map(m => `<tr><td class="id">${esc(m.id)}</td><td>${esc(m.requirement)}${m.note && m.status !== "Found" ? `<span class="evnote">${esc(m.note)}</span>` : ""}</td><td>${okIcon(m.status)}</td><td><div class="evfiles">${m.files.map(f => `${fileChip(f.path)}${f.expiry.key !== "none" && f.expiry.key !== "valid" ? `<span class="pill ${f.expiry.cls}">${esc(f.expiry.label)}</span>` : ""}`).join("") || "<span class='evnote'>None</span>"}</div></td></tr>`).join("")}
  </tbody></table></div>` : `<p class="waiting">No mandatory requirements were found in the tender.</p>`;
  return `
    <div class="cvsummary" style="padding:0;border:0">
      <span class="count ok"><b>${pack.linked.length}</b> files linked</span>
      <span class="count ${pack.issues.length ? "bad" : "ok"}"><b>${pack.issues.length}</b> items to fix</span>
      ${pack.deadline ? `<span class="count"><b>${esc(fmtDay(pack.deadline))}</b> closing date</span>` : ""}
    </div>
    ${pack.issues.length ? `<div class="sec"><h4>Fix before you submit</h4><ul class="plain fixlist">${pack.issues.map(i => `<li>${esc(i)}</li>`).join("")}</ul></div>` : ""}
    <div class="sec"><h4>Key personnel: CVs and certificates</h4>${persons ? `<div class="evgrid">${persons}</div>` : `<p class="waiting">${esc(c.steps.cv.note || "No skills match to build from.")}</p>`}</div>
    <div class="sec"><h4>Company experience: proof of similar work</h4>${exp ? `<div class="evgrid">${exp}</div>` : `<p class="waiting">${esc(c.steps.work.note || "No past work results to build from.")}</p>`}</div>
    <div class="sec"><h4>Mandatory documents</h4>${mand}</div>
    <p class="note">Click a file to open it. Expiry dates are checked against today and the tender's closing date.</p>`;
}

function evidenceMarkdown(c) {
  const p = buildPack(c), L = [];
  L.push("", `Files linked: ${p.linked.length}. Items to fix: ${p.issues.length}.`);
  if (p.issues.length) { L.push("", "### Fix before you submit", ""); p.issues.forEach(i => L.push(`- ${i}`)); }
  L.push("", "### Key personnel", "", "| Role | Consultant | Document | Status |", "|---|---|---|---|");
  p.personnel.forEach(x => {
    if (!x.name) { L.push(`| ${x.role} | None found | | Missing |`); return; }
    L.push(`| ${x.role} | ${x.name} | CV: ${x.cv && x.cv.path ? x.cv.path : "not found"} | ${x.cv && x.cv.st ? x.cv.st.label : "Unknown"} |`);
    x.certs.forEach(ct => L.push(`| ${x.role} | ${x.name} | ${ct.required}: ${ct.file || "none"} | ${ct.status === "Found" && ct.expiry ? ct.expiry.label : ct.status} |`));
  });
  L.push("", "### Company experience", "", "| Requirement | Project report | Reference letter |", "|---|---|---|");
  p.experience.forEach(e => e.items.forEach(i => L.push(`| ${e.id || ""} (${e.verdict}) | ${i.file} | ${i.letterFile || i.letter || ""} |`)));
  L.push("", "### Mandatory documents", "", "| ID | Requirement | Status | Documents |", "|---|---|---|---|");
  p.mandatory.forEach(m => L.push(`| ${m.id} | ${m.requirement} | ${m.status} | ${m.files.map(f => `${f.path} (${f.expiry.label})`).join("; ") || "None"} |`));
  return L;
}

/* ---------------- document viewer ---------------- */
let dlgUrl = null;
function openDoc(path) {
  const d = findDoc(path); if (!d) { toast("That file is not in the loaded folder."); return; }
  $("#dlgKind").textContent = KIND_ONE[d.kind] || "Document";
  $("#dlgTitle").textContent = baseName(d.path);
  $("#dlgPath").textContent = d.path;
  $("#dlgText").textContent = clip(d.text, 20000) + (d.text.length > 20000 ? "\n..." : "");
  if (dlgUrl) { URL.revokeObjectURL(dlgUrl); dlgUrl = null; }
  const acts = $("#dlgActions"); acts.innerHTML = "";
  if (d.file) {
    dlgUrl = URL.createObjectURL(d.file);
    const a = document.createElement("a"); a.className = "btn small primary"; a.href = dlgUrl; a.target = "_blank"; a.rel = "noopener"; a.textContent = "Open original file";
    acts.appendChild(a);
  } else {
    const n = document.createElement("span"); n.className = "note"; n.textContent = d.src === "demo" ? "Demo document: only the text is available." : "Only the text is available for this document.";
    acts.appendChild(n);
  }
  $("#docDialog").showModal();
}
$("#dlgClose").addEventListener("click", () => $("#docDialog").close());
$("#docDialog").addEventListener("close", () => { if (dlgUrl) { setTimeout(() => { URL.revokeObjectURL(dlgUrl); dlgUrl = null; }, 60000); } });
document.addEventListener("click", e => { const v = e.target.closest("[data-view]"); if (v) openDoc(v.dataset.view); });

function sourcesLabel() { const p = []; if (S.demoOn) p.push("demo repository"); if (S.local.length) p.push(S.localName); if (S.added.length) p.push("added documents"); return p.join(", ") || "no documents"; }
$("#runBtn").addEventListener("click", async () => {
  if (S.running) return;
  S.current = { id: "r" + Date.now(), title: $("#bidTitle").value.trim() || "Untitled bid", rfpName: S.rfpName, createdAt: Date.now(), sourcesLabel: sourcesLabel(), docs: allDocs(),
    steps: { info: { status: "waiting" }, cv: { status: "waiting" }, work: { status: "waiting" }, evidence: { status: "waiting" } } };
  S.ctls = []; setRunning(true); renderBoard(); $("#board").scrollIntoView({ block: "start" });
  if (await stepInfo()) { await Promise.allSettled([stepCv(), stepWork()]); await stepEvidence(); }
  else ["cv", "work", "evidence"].forEach(k => { S.current.steps[k].status = "skipped"; S.current.steps[k].note = "Skipped because step 1 did not finish."; });
  setRunning(false); paintAll(); saveRun();
});
async function rerun(id) {
  const c = S.current; if (S.running || !c) return;
  if (!S.token) { showGate(""); return; }
  if (!c.docs) c.docs = allDocs();
  S.ctls = []; setRunning(true); paintAll();
  if (!c.steps.evidence) c.steps.evidence = { status: "waiting" };
  if (id === "info" || !c.steps.info.data) { if (await stepInfo()) { await Promise.allSettled([stepCv(), stepWork()]); await stepEvidence(); } }
  else if (id === "cv") { await stepCv(); await stepEvidence(); }
  else if (id === "work") { await stepWork(); await stepEvidence(); }
  else await stepEvidence();
  setRunning(false); paintAll(); saveRun();
}
$("#stopBtn").addEventListener("click", () => S.ctls.forEach(c => c.abort()));
$("#board").addEventListener("click", e => {
  const r = e.target.closest("[data-rerun]"); if (r) { rerun(r.dataset.rerun); return; }
  const d = e.target.closest("[data-dl]"); if (d) { download(d.dataset.dl); return; }
  if (e.target.closest("#copyMd")) navigator.clipboard.writeText(toMarkdown()).then(() => toast("Copied"), () => toast("Copy is blocked here. Use Download instead."));
});

/* ---------------- saved (this browser only) ---------------- */
function saveRun() {
  const c = S.current; if (!c || !c.steps.info.data) return;
  const rec = { id: c.id, title: c.title, rfpName: c.rfpName || "", createdAt: c.createdAt, sourcesLabel: c.sourcesLabel,
    steps: Object.fromEntries(STEPS.map(s => [s.id, { status: c.steps[s.id].status, note: c.steps[s.id].note || "", scanNote: c.steps[s.id].scanNote || "", data: c.steps[s.id].data || null }])) };
  S.runs = [rec, ...S.runs.filter(r => r.id !== rec.id)].slice(0, 20);
  if (store.set("bdRuns", S.runs)) toast("Saved in this browser"); else toast("Could not save in this browser. Download it to keep a copy.");
  renderSaved();
}
let pendingRun = null;
function renderSaved() {
  $("#runCount").textContent = S.runs.length;
  const box = $("#savedBox");
  if (!S.runs.length) { box.innerHTML = `<p class="emptybig">No saved analyses yet. Each analysis is saved in this browser automatically. Use Download to share one.</p>`; return; }
  box.innerHTML = `<ul>${S.runs.map(r => `<li><div class="nm"><b>${esc(r.title)}</b><span>${esc(r.rfpName || "Pasted tender")} · ${fmtDate(r.createdAt)} · ${esc(r.sourcesLabel || "")}</span></div>
    <div class="row"><button class="btn small" data-open="${esc(r.id)}" type="button">Open</button><button class="btn small danger" data-rdel="${esc(r.id)}" type="button">${pendingRun === r.id ? "Confirm delete" : "Delete"}</button></div></li>`).join("")}</ul>`;
}
$("#savedBox").addEventListener("click", e => {
  const o = e.target.closest("[data-open]");
  if (o) {
    if (S.running) { toast("Wait for the current analysis to finish."); return; }
    const r = S.runs.find(x => x.id === o.dataset.open); if (!r) return;
    S.current = { ...r, docs: null, steps: Object.fromEntries(STEPS.map(s => [s.id, { ...(r.steps[s.id] || { status: "skipped", note: "This analysis was saved before this step existed. Run it again to add it." }) }])) };
    renderBoard(); showTab("analyse"); return;
  }
  const d = e.target.closest("[data-rdel]");
  if (d) {
    const id = d.dataset.rdel;
    if (pendingRun !== id) { pendingRun = id; renderSaved(); return; }
    pendingRun = null; S.runs = S.runs.filter(r => r.id !== id); store.set("bdRuns", S.runs); renderSaved(); toast("Deleted");
  }
});

/* ---------------- export ---------------- */
function toMarkdown() {
  const c = S.current; if (!c) return "";
  const L = [`# ${c.title}`, "", `Tender: ${c.rfpName || "pasted text"}. Analysed ${fmtDate(c.createdAt)}. Searched: ${c.sourcesLabel || ""}.`, ""];
  const x = c.steps.info.data;
  L.push("## 1. Key information");
  if (x) {
    if (x.summary) L.push("", x.summary);
    L.push("", "| Item | Detail |", "|---|---|");
    [["Client", x.client], ["Project", x.project], ["Reference", x.reference], ["Industry", x.industry], ["Closing date", x.submissionDeadline], ["Briefing session", x.briefingSession], ["Contract duration", x.contractDuration], ["Submission", x.submissionMethod]].forEach(([a, b]) => L.push(`| ${a} | ${str(b)} |`));
    if (arr(x.mandatory).length) { L.push("", "### Mandatory requirements", "", "| ID | Requirement | Proof needed | If missed |", "|---|---|---|---|"); arr(x.mandatory).forEach(m => L.push(`| ${m.id} | ${m.requirement} | ${str(m.evidence)} | ${m.disqualifying ? "Disqualified" : "Scored"} |`)); }
    if (arr(x.evaluation).length) { L.push("", "### How bids are scored", "", "| Stage | Criterion | Points | Detail |", "|---|---|---|---|"); arr(x.evaluation).forEach(e => L.push(`| ${str(e.stage)} | ${e.criterion} | ${e.points ?? "n/a"} | ${e.detail || ""} |`)); }
    if (arr(x.roles).length) { L.push("", "### Roles", ""); arr(x.roles).forEach(r => L.push(`- **${r.role}**: ${[...arr(r.qualifications), ...arr(r.certifications), r.minYears ? r.minYears + "+ years" : "", ...arr(r.experience)].filter(Boolean).join("; ")}`)); }
    if (arr(x.experienceRequirements).length) { L.push("", "### Previous work requested", ""); arr(x.experienceRequirements).forEach(r => L.push(`- ${r.id}: ${r.requirement}`)); }
  } else L.push("", NA);
  const cv = c.steps.cv.data;
  L.push("", "## 2. Skills match from CVs");
  if (cv) arr(cv.roles).forEach(r => {
    L.push("", `### ${r.role}`, "", "| Consultant | Match | Meets | Gaps | Confidence | CV updated |", "|---|---|---|---|---|---|");
    arr(r.candidates).forEach(cd => {
      const d = docForCandidate(cd), m = d && cvMeta(d), st = m && cvStatus(m);
      const cvCol = !st ? "Unknown" : st.key === "unknown" ? "No date" : `${fmtDay(m.updated)} (${st.label})`;
      L.push(`| ${cd.name} | ${cd.match}% | ${arr(cd.meets).join("; ")} | ${arr(cd.gaps).join("; ") || "None"} | ${cd.confidence} | ${cvCol} |`);
    });
    if (!arr(r.candidates).length) L.push("| No suitable CV found | | | | | |");
    if (r.recommendation) L.push("", `Recommendation: ${r.recommendation}`);
  }); else L.push("", c.steps.cv.note || NA);
  const w = c.steps.work.data;
  L.push("", "## 3. Past work that supports the bid");
  if (w) arr(w.requirements).forEach(r => {
    L.push("", `### ${r.id || ""} ${r.requirement}`, "", `Verdict: **${r.verdict}**. ${r.explanation || ""}`, "", "| Document | Client | Year | Value | Relevance | Reference letter |", "|---|---|---|---|---|---|");
    arr(r.matches).forEach(m => L.push(`| ${m.file} | ${str(m.client)} | ${str(m.year)} | ${str(m.value)} | ${m.relevance} | ${m.referenceLetter || ""} |`));
    if (r.action) L.push("", `Next step: ${r.action}`);
  }); else L.push("", c.steps.work.note || NA);
  L.push("", "## 4. Evidence pack for the submission");
  if (c.steps.evidence && c.steps.evidence.data) L.push(...evidenceMarkdown(c));
  else L.push("", (c.steps.evidence && c.steps.evidence.note) || NA);
  return L.join("\n");
}
function mdToHtml(md) {
  const lines = md.split("\n"), out = []; let i = 0;
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  while (i < lines.length) {
    const l = lines[i];
    if (/^\|/.test(l)) {
      const rows = []; while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i]); i++; }
      const cells = r => r.replace(/^\||\|$/g, "").split("|").map(x => x.trim());
      out.push("<table><thead><tr>" + cells(rows[0]).map(c => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>" + rows.slice(2).map(r => "<tr>" + cells(r).map(c => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") + "</tbody></table>");
      continue;
    }
    if (/^### /.test(l)) out.push(`<h3>${inline(l.slice(4))}</h3>`); else if (/^## /.test(l)) out.push(`<h2>${inline(l.slice(3))}</h2>`); else if (/^# /.test(l)) out.push(`<h1>${inline(l.slice(2))}</h1>`);
    else if (/^- /.test(l)) out.push(`<li>${inline(l.slice(2))}</li>`); else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
    i++;
  }
  return out.join("\n");
}
function download(kind) {
  const md = toMarkdown();
  const css = "body{font-family:Arial,Helvetica,sans-serif;max-width:960px;margin:40px auto;padding:0 20px;line-height:1.5;color:#13212c}h2{border-top:1px solid #ccd5db;padding-top:.6em;margin-top:1.6em}table{border-collapse:collapse;width:100%;font-size:13px;margin:1em 0}th,td{border:1px solid #ccd5db;padding:6px 8px;text-align:left;vertical-align:top}th{background:#eef2f4}";
  const data = kind === "md" ? md : `<!doctype html><html><head><meta charset="utf-8"><title>${esc(S.current.title)}</title><style>${css}</style></head><body>${mdToHtml(md)}</body></html>`;
  const url = URL.createObjectURL(new Blob([data], { type: kind === "md" ? "text/markdown" : "text/html" }));
  const a = document.createElement("a"); a.href = url; a.download = `${slug(S.current.title)}.${kind}`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------------- boot ---------------- */
renderOutline(); renderTree(); renderSaved();
if (!API) banner("The backend address is not set. Add the API_URL repository variable and redeploy (see the README).");
const tok = sess.get("bdToken"), exp = Number(sess.get("bdExp") || 0);
if (tok && exp > Date.now()) { S.token = tok; $("#gate").hidden = true; } else showGate("");
renderSources();
})();
