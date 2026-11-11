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
let docsCache = null;
const allDocs = () => (docsCache ||= assignOwners([...(S.demoOn ? DEMO.map((d, i) => ({ ...d, id: "demo" + i, src: "demo" })) : []), ...S.local, ...S.added]));
const GENERIC_DIR = /^(cvs?|resumes?|consultants?|people|staff|team|employees|documents?|certificates?|certs?|demo repository|added documents)$/i;
const dirOf = p => String(p || "").split("/").slice(0, -1).join("/");
/** A folder holding exactly one CV is that person's folder: every file under it belongs to them. */
function assignOwners(docs) {
  const byDir = {};
  docs.forEach(d => { if (d.kind === "cv") (byDir[dirOf(d.path)] ||= []).push(d); });
  const folders = Object.keys(byDir).filter(dir => byDir[dir].length === 1 && dir && !GENERIC_DIR.test(dir.split("/").pop()));
  if (!folders.length) return docs;
  return docs.map(d => {
    const f = folders.filter(x => d.path.startsWith(x + "/")).sort((a, b) => b.length - a.length)[0];
    if (!f) return d;
    const kind = d.kind === "project" && !d.kindManual ? "cert" : d.kind;
    return { ...d, owner: f.split("/").pop(), ownerDir: f, kind };
  });
}

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
  if (ext === "pptx") return readPptx(file);
  if (["txt", "md", "csv"].includes(ext)) return { text: await file.text() };
  throw new Error(`"${file.name}" is not a supported type.`);
}
const supported = f => /\.(pdf|docx|pptx|txt|md|csv)$/i.test(f.name);

/* ---------------- PowerPoint (.pptx) reading ----------------
   A .pptx file is a zip of XML files, one per slide. This reads the zip with the browser's
   own DecompressionStream, so no extra library is needed. Each slide's text is kept under a
   [Slide N] marker, so evidence can point to the exact slide. */
async function unzip(buf) {
  const dv = new DataView(buf), td = new TextDecoder();
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("bad_zip");
  const n = dv.getUint16(eocd + 10, true), files = {};
  let p = dv.getUint32(eocd + 16, true);
  for (let k = 0; k < n && p + 46 <= buf.byteLength; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    files[td.decode(new Uint8Array(buf, p + 46, nl))] = { method, csize, off };
    p += 46 + nl + xl + cl;
  }
  return {
    names: Object.keys(files),
    async text(name) {
      const e = files[name]; if (!e) return "";
      const start = e.off + 30 + dv.getUint16(e.off + 26, true) + dv.getUint16(e.off + 28, true);
      const data = new Uint8Array(buf, start, e.csize);
      if (e.method === 0) return td.decode(data);
      if (e.method !== 8 || typeof DecompressionStream === "undefined") throw new Error("unsupported_zip");
      return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
    },
  };
}
async function readPptx(file) {
  let z;
  try { z = await unzip(await file.arrayBuffer()); } catch { throw new Error(`"${file.name}" could not be opened as a PowerPoint file.`); }
  const xml = s => new DOMParser().parseFromString(s, "application/xml");
  let order = z.names.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]));
  try {
    const rels = xml(await z.text("ppt/_rels/presentation.xml.rels")), map = {};
    [...rels.getElementsByTagName("Relationship")].forEach(r => { map[r.getAttribute("Id")] = "ppt/" + String(r.getAttribute("Target") || "").replace(/^\/?(ppt\/)?/, ""); });
    const ids = [...xml(await z.text("ppt/presentation.xml")).getElementsByTagName("p:sldId")].map(e => map[e.getAttribute("r:id")]).filter(n => n && z.names.includes(n));
    if (ids.length) order = ids;
  } catch { /* fall back to file name order */ }
  const out = [];
  for (let i = 0; i < order.length; i++) {
    const doc = xml(await z.text(order[i]));
    const paras = [...doc.getElementsByTagName("a:p")].map(p => [...p.getElementsByTagName("a:t")].map(t => t.textContent).join("").replace(/\s+/g, " ").trim()).filter(Boolean);
    if (paras.length) out.push(`[Slide ${i + 1}]\n${paras.join("\n")}`);
  }
  const text = out.join("\n\n");
  if (text.replace(/\[Slide \d+\]/g, "").trim().length < 20) throw new Error(`"${file.name}" has no text on its slides. Slides that are only pictures cannot be read.`);
  return { text, pages: order.length, unit: "slides" };
}
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
    tracker_not_configured: "The bid tracker storage is not set up yet. Run the backend deploy on GitHub again.",
    tracker_full: "The bid tracker is full (500 bids). Delete old or example bids first.",
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
/** Turns "merhawi.hailu@company.com" into "Merhawi" (first name) and "Merhawi Hailu" (full name). */
function namesFromEmail(email) {
  const local = String(email || "").split("@")[0].toLowerCase();
  const parts = local.split(/[._\-+]+/).map(x => x.replace(/\d+/g, "")).filter(x => x.length > 1);
  const cap = x => x.charAt(0).toUpperCase() + x.slice(1);
  return { first: parts.length ? cap(parts[0]) : "", full: parts.slice(0, 3).map(cap).join(" ") };
}
function renderHello() {
  const el = $("#hello"), email = sess.get("bdEmail") || "", n = namesFromEmail(email);
  el.hidden = !S.token || !email;
  if (el.hidden) return;
  const initials = (n.full || email).split(" ").map(w => w.charAt(0)).join("").slice(0, 2).toUpperCase();
  el.innerHTML = `<span class="avatar" aria-hidden="true">${esc(initials)}</span><span>Hi ${esc(n.first || "there")}</span>`;
  el.title = email;
}
function showGate(msg) {
  $("#gate").hidden = false; const e = $("#loginErr"); e.hidden = !msg; e.textContent = msg || "";
  setTimeout(() => ($("#email").value ? $("#pw") : $("#email")).focus(), 0);
}
function signOut(expired) {
  if (typeof B !== "undefined") { B.list = []; B.loaded = false; }
  S.token = null; sess.set("bdToken", null); sess.set("bdExp", null); sess.set("bdEmail", null); renderHello();
  S.ctls.forEach(c => c.abort());
  showGate(expired ? "Your sign in has ended. Sign in again." : "");
}
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = $("#loginBtn"), pw = $("#pw").value, email = $("#email").value.trim();
  if (!pw || !SAFE_EMAIL.test(email)) { showGate("Enter a valid email address and the password."); return; }
  btn.disabled = true; btn.textContent = "Signing in...";
  try {
    const j = await api("/api/login", { password: pw });
    S.token = j.token; sess.set("bdToken", j.token); sess.set("bdExp", String(j.expiresAt));
    sess.set("bdEmail", email); store.set("bdLastEmail", email);
    const n = namesFromEmail(email);
    if (n.full && !store.get("bdSender", "")) { store.set("bdSender", n.full); const sn = $("#senderName"); if (sn && !sn.value) sn.value = n.full; }
    $("#pw").value = ""; $("#gate").hidden = true; renderHello(); renderSources(); render();
  } catch (err) {
    const m = { wrong_password: "That password is not right.", rate_limited: "Too many attempts. Wait a minute, then try again.", server_not_configured: errCopy("server_not_configured"), network: errCopy("network") }[err.code] || "Could not sign in. Try again.";
    showGate(m);
  } finally { btn.disabled = false; btn.textContent = "Sign in"; }
});
$("#logoutBtn").addEventListener("click", () => signOut(false));

/* ---------------- tender intake ---------------- */
$("#rfpFile").addEventListener("change", async e => {
  const f = e.target.files[0]; if (!f) return;
  const m = $("#rfpMeta"); m.hidden = false; m.textContent = `Reading ${f.name}...`;
  try {
    const { text, pages } = await extractText(f);
    $("#rfpText").value = text; S.rfpName = f.name;
    if (!$("#bidTitle").value.trim()) $("#bidTitle").value = f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
    m.textContent = `${f.name} · ${pages ? pages + (f.name.toLowerCase().endsWith(".pptx") ? " slides · " : " pages · ") : ""}${fmtN(text.length)} characters`;
  } catch (err) { m.textContent = err.message; }
  e.target.value = ""; renderSources();
});
$("#rfpText").addEventListener("input", renderSources);
$("#loadSample").addEventListener("click", () => {
  $("#rfpText").value = SAMPLE_RFP; $("#bidTitle").value = "Northvale data analytics platform (sample)"; S.rfpName = "Northvale RFP NMM-ICT-2026-014 (sample).pdf";
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
  $("#srcSummary").textContent = `${sourcesLabel()} (${allDocs().length} documents)`;
  $("#srcDemo").addEventListener("change", e => { S.demoOn = e.target.checked; renderTree(); renderSources(); });
  $("#goRepo").addEventListener("click", () => go("documents"));
  $("#runBtn").disabled = S.running || !S.token || $("#rfpText").value.trim().length < 200;
  $("#runBtn").title = !S.token ? "Sign in first" : $("#rfpText").value.trim().length < 200 ? "Upload an RFP or load the sample first" : "";
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
  docsCache = null;
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
  const d = [...S.local, ...S.added].find(x => x.id === s.dataset.kind); if (d) { d.kind = s.value; d.kindManual = true; renderTree(); renderSources(); }
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
  const fromTitle = doc.title.replace(/[\s_-]*(curriculum vitae|cv|resume|résumé)$/i, "").replace(/^(curriculum vitae|cv|resume|résumé)[\s_-]*/i, "").replace(/[_-]+/g, " ").trim();
  const name = doc.owner || fromTitle || doc.title;
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
function belongsTo(doc, name, cv) {
  if (doc.ownerDir) return Boolean(cv && cv.ownerDir === doc.ownerDir) || norm(doc.owner) === norm(name);
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

const certAiStore = () => store.get("bdCertAi", {});
const ATTENDANCE = /certificate of (attendance|participation|completion)|attended (a|an|the)\b|course attendance|not an? [a-z0-9 ]{0,20}exam certificate/i;
/** The files the AI should read for a person: everything in their folder, or certificates that name them. */
function personFiles(cv, meta, docs) {
  const certs = docs.filter(d => d.path !== cv.path && d.kind !== "cv");
  return cv.ownerDir ? certs.filter(d => d.ownerDir === cv.ownerDir) : certs.filter(d => d.kind === "cert" && belongsTo(d, meta.name, cv));
}
const certSig = (cv, files) => [cv.path + ":" + cv.text.length, ...files.map(f => f.path + ":" + f.text.length)].join("|");
function proofStatus(doc) {
  const exp = expiryInfo(doc, null);
  return exp.key === "expired" ? { key: "expired", cls: "bad", label: exp.label }
    : exp.key === "soon" ? { key: "soon", cls: "warn", label: exp.label }
    : exp.key === "valid" ? { key: "ok", cls: "ok", label: exp.label }
    : { key: "ok", cls: "ok", label: "Proof found (no expiry date)" };
}

/** Compares each CV's listed certifications with the certificate files in the folder. */
function certReport() {
  const docs = allDocs(), links = certLinks(), aiAll = certAiStore();
  const people = docs.filter(d => d.kind === "cv").map(cv => {
    const meta = cvMeta(cv), files = personFiles(cv, meta, docs), mine = files.filter(d => d.kind === "cert"), used = new Set();
    const saved = aiAll[cv.path], ai = saved && saved.sig === certSig(cv, files) ? saved : null;
    let claims, extra;
    if (ai) {
      claims = arr(ai.result.claims).map(c => {
        const info = claimInfo(String(c.certification || "")), lk = links[cv.path + "::" + info.key];
        let doc = lk ? findDoc(lk) : c.file ? findDoc(c.file) : null, how = lk && doc ? "linked by you" : "checked by AI";
        let status;
        if (lk && doc) status = proofStatus(doc);
        else if (c.status === "Proof found" && doc) status = proofStatus(doc);
        else if (c.status === "Proof does not match") status = { key: "mismatch", cls: "bad", label: "Proof does not match" };
        else { status = { key: "missing", cls: "bad", label: "No proof in folder" }; if (c.status !== "Proof does not match") doc = null; }
        if (doc) used.add(doc.path);
        return { ...info, text: String(c.certification || info.text), doc, how, note: c.note || "", status };
      });
      extra = arr(ai.result.extra).map(x => ({ doc: findDoc(x.file), title: x.certification, note: x.note })).filter(x => x.doc && !used.has(x.doc.path));
    } else {
      claims = certClaims(cv.text).map(cl => {
        const lk = links[cv.path + "::" + cl.key];
        let doc = lk ? findDoc(lk) : null, how = doc ? "linked by you" : "";
        if (!doc) { doc = mine.find(d => claimMatches(cl, d)) || null; if (doc) how = "quick match by name and code"; }
        if (doc) used.add(doc.path);
        let status = doc ? proofStatus(doc) : { key: "missing", cls: "bad", label: "No proof in folder" };
        if (doc && how !== "linked by you" && ATTENDANCE.test(doc.text)) status = { key: "mismatch", cls: "warn", label: "Check: looks like course attendance, not an exam certificate" };
        return { ...cl, doc, how, note: "", status };
      });
      extra = mine.filter(d => !used.has(d.path)).map(d => ({ doc: d, title: certTitle(d), note: "" }));
    }
    return { cv, meta, files, claims, extra, ai: ai ? { at: ai.at } : null };
  });
  const all = people.flatMap(p => p.claims), k = key => all.filter(c => c.status.key === key).length;
  return {
    people,
    totals: { claims: all.length, ok: k("ok"), missing: k("missing"), mismatch: k("mismatch"), expired: k("expired"), soon: k("soon"), extra: people.reduce((n, p) => n + p.extra.length, 0), checked: people.filter(p => p.ai).length },
  };
}

/** Asks the AI to read each person's CV and the files in their folder. */
let certAiRunning = false;
async function runCertAi() {
  if (certAiRunning) return;
  if (!S.token) { showGate("Sign in to run the AI check."); return; }
  const docs = allDocs();
  const people = docs.filter(d => d.kind === "cv").map(cv => { const meta = cvMeta(cv); return { cv, meta, files: personFiles(cv, meta, docs) }; });
  if (!people.length) { toast("No CVs to check."); return; }
  certAiRunning = true; const btn = $("#certAiBtn"), stat = $("#certAiStatus"); btn.disabled = true;
  const all = certAiStore(); let done = 0, failed = "";
  const batches = []; for (let i = 0; i < people.length; i += 4) batches.push(people.slice(i, i + 4));
  for (const batch of batches) {
    stat.textContent = `Reading CVs and certificates: ${done} of ${people.length} people done...`;
    try {
      const res = await ask("certcheck", { people: batch.map(p => ({ name: p.meta.name, cvPath: p.cv.path, cvText: clip(p.cv.text, 6000), files: forSend(p.files, 24000) })) });
      batch.forEach(p => {
        const r = arr(res && res.people).find(x => x.cvPath === p.cv.path) || arr(res && res.people).find(x => norm(x.name) === norm(p.meta.name));
        if (r) all[p.cv.path] = { sig: certSig(p.cv, p.files), at: Date.now(), result: { claims: arr(r.claims), extra: arr(r.extra) } };
      });
      done += batch.length;
      store.set("bdCertAi", all); renderCertCheck();
    } catch (e) { failed = errCopy(e && e.code); break; }
  }
  certAiRunning = false; btn.disabled = false;
  stat.textContent = failed ? `Stopped after ${done} of ${people.length} people. ${failed}` : `AI check finished for ${done} people, ${fmtDate(Date.now())}.`;
  renderCertCheck();
}

function certRequestText(p) {
  const first = p.meta.name.split(/\s+/)[0] || "there";
  const due = fmtDay(new Date(Date.now() + 14 * DAY));
  const sender = String(store.get("bdSender", "") || "").trim();
  const missing = [...p.claims.filter(c => c.status.key === "missing").map(c => `- ${c.text} (no copy on file)`),
    ...p.claims.filter(c => c.status.key === "mismatch").map(c => `- ${c.text} (the file we have is not valid proof${c.note ? ": " + c.note.replace(/\.$/, "") : ""})`)];
  const expired = p.claims.filter(c => c.status.key === "expired" || c.status.key === "soon").map(c => `- ${c.text} (${lowerFirst(c.status.label)}, please send the renewed certificate)`);
  const extra = p.extra.map(x => `- ${x.title || certTitle(x.doc)}`);
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
  const badge = $("#certDue"), bad = t.missing + t.mismatch + t.expired;
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
    <span class="count bad"><b>${t.mismatch}</b> proof does not match</span>
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
        <td>${c.doc ? `${fileChip(c.doc.path)}<span class="evnote">${esc(c.how)}</span>${c.note ? `<span class="evnote ainote">${esc(c.note)}</span>` : ""}` : `${c.note ? `<span class="evnote ainote">${esc(c.note)}</span>` : ""}<select class="kindsel" data-certlink="${esc(p.cv.path + "::" + c.key)}" aria-label="Link a certificate file for ${esc(c.text)}"><option value="">Link a file...</option>${allCerts.map(d => `<option value="${esc(d.path)}">${esc(baseName(d.path))}</option>`).join("")}</select>`}</td>
        <td><span class="pill ${c.status.cls}">${esc(c.status.label)}</span>${c.how === "linked by you" ? ` <button class="btn link" type="button" data-certunlink="${esc(p.cv.path + "::" + c.key)}">Unlink</button>` : ""}</td>
      </tr>`).join("");
    const extras = p.extra.map(x => `<tr>
        <td>${esc(x.title || certTitle(x.doc))}<span class="evnote">On file, not listed in the CV</span>${x.note ? `<span class="evnote ainote">${esc(x.note)}</span>` : ""}</td>
        <td>${fileChip(x.doc.path)}</td>
        <td><span class="pill warn">Add to CV</span></td>
      </tr>`).join("");
    return `<section class="evcard certcard">
      <div class="evhead"><b>${esc(p.meta.name)}${p.cv.ownerDir ? `<span class="evnote">Folder: ${esc(p.cv.ownerDir.split("/").pop())} · ${p.files.length} other file${p.files.length === 1 ? "" : "s"}</span>` : ""}</b><span>${p.ai ? `<span class="pill ok">Checked by AI</span>` : `<span class="pill na">Quick check</span>`} ${fileChip(p.cv.path)} ${probs ? `<span class="pill bad">${probs} to fix</span>` : `<span class="pill ok">All proof on file</span>`}</span></div>
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
$("#certAiBtn").addEventListener("click", runCertAi);
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

/* ---------------- analysis steps ---------------- */
const STEPS = [
  { id: "info", title: "Read the RFP" },
  { id: "cv", title: "Match CVs to roles" },
  { id: "work", title: "Find credentials and past work" },
  { id: "evidence", title: "Link certificates and documents" },
];
const STATUS = { waiting: "Waiting", working: "Working", done: "Done", error: "Failed", stopped: "Stopped", skipped: "Skipped" };
let rq = 0;
/** Steps call paint() while they run. The screen is redrawn once per frame. */
function paint() { if (!rq) rq = requestAnimationFrame(() => { rq = 0; render(); }); }

function fact(label, v, extra = "") { return `<div class="fact"><dt>${esc(label)}</dt><dd class="${isNA(v) ? "na" : ""}">${esc(str(v))}${extra}</dd></div>`; }
function closingInfo(x) {
  if (!x || !x.submissionDeadlineISO || !/^\d{4}-\d{2}-\d{2}/.test(x.submissionDeadlineISO)) return null;
  const days = Math.ceil((new Date(x.submissionDeadlineISO.slice(0, 10) + "T23:59:59") - new Date()) / DAY);
  return { days, text: days < 0 ? "Closed" : days === 0 ? "Closes today" : `${days} day${days === 1 ? "" : "s"} left` };
}
function viewAnalysis(x) {
  const ci = closingInfo(x);
  const cd = ci ? `<br><span class="countdown ${ci.days < 0 ? "late" : ""}">${esc(ci.text)}</span>` : "";
  const maxPts = Math.max(1, ...arr(x.evaluation).map(e => Number(e.points) || 0));
  return `
  ${x.summary ? `<div class="box pad"><p class="eyebrow">Summary</p><p class="lead">${esc(x.summary)}</p></div>` : ""}
  <div class="box pad"><p class="eyebrow">Key facts</p><dl class="facts">
    ${fact("Client", x.client)}${fact("Project", x.project)}${fact("Reference", x.reference)}${fact("Industry", x.industry)}
    ${fact("Closing date", x.submissionDeadline, cd)}${fact("Briefing session", x.briefingSession)}${fact("Contract duration", x.contractDuration)}${fact("Submission", x.submissionMethod)}
  </dl></div>
  ${arr(x.evaluation).length ? `<div class="box pad"><p class="eyebrow">How bids are scored</p><div class="tbl"><table><thead><tr><th>Stage</th><th>Criterion</th><th>Points</th><th>Detail</th></tr></thead><tbody>
    ${arr(x.evaluation).map(e => `<tr><td>${esc(str(e.stage))}</td><td>${esc(e.criterion)}</td><td>${Number(e.points) ? `<div class="wbar"><i style="width:${Math.round(70 * Number(e.points) / maxPts)}px"></i><span>${esc(e.points)}</span></div>` : "<span class='pill na'>n/a</span>"}</td><td>${esc(e.detail || "")}</td></tr>`).join("")}
  </tbody></table></div>${arr(x.thresholds).length ? `<p class="note">Thresholds: ${esc(arr(x.thresholds).join("; "))}</p>` : ""}</div>` : ""}
  ${delivTable(x)}
  ${resourceTable(x)}
  ${arr(x.notStated).length ? `<div class="box pad"><p class="eyebrow">Not stated in the RFP</p><ul class="plain">${arr(x.notStated).map(d => `<li>${esc(d)}</li>`).join("")}</ul></div>` : ""}`;
}

/** Deliverables as a table. Older analyses only have names, so the other columns show what is known. */
function delivTable(x) {
  const names = arr(x.deliverables), det = arr(x.deliverableDetails);
  const rows = (det.length ? det : names.map(n => ({ deliverable: n }))).filter(d => d && (d.deliverable || d.description));
  if (!rows.length) return "";
  const hasDue = rows.some(d => d.due && !isNA(d.due)), hasRef = rows.some(d => d.reference);
  return `<div class="box pad"><div class="grouphead"><p class="eyebrow">Key deliverables</p><span class="note">${rows.length} deliverable${rows.length === 1 ? "" : "s"}</span></div>
    <div class="tbl"><table><thead><tr><th>#</th><th>Deliverable</th>${det.length ? "<th>What must be handed over</th>" : ""}${hasDue ? "<th>When</th>" : ""}${hasRef ? "<th>Clause</th>" : ""}</tr></thead><tbody>
    ${rows.map((d, i) => `<tr><td class="id">${i + 1}</td><td><b>${esc(d.deliverable || "")}</b></td>${det.length ? `<td>${esc(d.description || "")}</td>` : ""}${hasDue ? `<td class="${isNA(d.due) ? "evnote" : ""}">${esc(isNA(d.due) ? "Not stated" : d.due)}</td>` : ""}${hasRef ? `<td class="id">${esc(d.reference || "")}</td>` : ""}</tr>`).join("")}
    </tbody></table></div></div>`;
}
/** The people and certifications the RFP asks for. When CVs have been matched, shows who fills each role. */
function resourceTable(x) {
  const roles = arr(x.roles); if (!roles.length) return "";
  const c = S.current, cvRoles = arr(c && c.steps.cv.data && c.steps.cv.data.roles);
  const list = (a, none = "Not stated") => (arr(a).length ? `<ul class="cell">${arr(a).map(v => `<li>${esc(v)}</li>`).join("")}</ul>` : `<span class="evnote">${none}</span>`);
  const who = r => {
    if (!cvRoles.length) return `<span class="evnote">${c && busy(c.steps.cv) ? "Matching CVs..." : "Not matched yet"}</span>`;
    const cr = cvRoles.find(y => norm(y.role) === norm(r.role)) || cvRoles.find(y => norm(y.role).includes(norm(r.role)) || norm(r.role).includes(norm(y.role)));
    const ok = cr ? matchingCvs(cr) : [];
    return ok.length ? ok.slice(0, 2).map(cd => `<span class="pill ok">${esc(cd.name)}</span>`).join(" ") : `<span class="pill bad">No CV meets all</span>`;
  };
  const certCount = roles.reduce((n, r) => n + arr(r.certifications).length + arr(r.registrations).length, 0);
  return `<div class="box pad"><div class="grouphead"><p class="eyebrow">Required resources</p><span class="note">${roles.length} role${roles.length === 1 ? "" : "s"} · ${certCount} certification${certCount === 1 ? "" : "s"} or registration${certCount === 1 ? "" : "s"} asked for</span></div>
    <div class="tbl"><table class="restbl"><thead><tr><th>Role</th><th>No.</th><th>Certifications and registrations</th><th>Qualifications</th><th>Min. years</th><th>Experience</th><th>Our match</th></tr></thead><tbody>
    ${roles.map(r => `<tr><td><b>${esc(r.role)}</b>${r.reference ? `<span class="ty">Clause ${esc(r.reference)}</span>` : ""}</td><td class="num">${esc(r.count ?? 1)}</td>
      <td>${list([...arr(r.certifications), ...arr(r.registrations)], "None asked for")}</td><td>${list(r.qualifications)}</td>
      <td class="num">${r.minYears != null && r.minYears !== "" ? esc(r.minYears) + "+" : `<span class="evnote">Not stated</span>`}</td>
      <td>${list([...arr(r.experience), ...arr(r.skills)])}</td><td>${who(r)}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="note">The certifications are checked against each person's certificate files on Evidence check and CV and cert checks.</p></div>`;
}

/** A CV only counts as a match when it meets every stated requirement of the role. */
const qualifies = cd => cd && (cd.meetsAll === true || (cd.meetsAll == null && !arr(cd.gaps).length));
const byMatch = (a, b) => (Number(b.match) || 0) - (Number(a.match) || 0);
const matchingCvs = r => arr(r.candidates).filter(qualifies).sort(byMatch);
const nearMisses = r => arr(r.candidates).filter(cd => !qualifies(cd)).sort(byMatch);
function candCard(cd) {
  const m = Math.max(0, Math.min(100, Number(cd.match) || 0));
  return `<div class="cand"><div class="top"><span class="nm">${esc(cd.name)}</span>${qualifies(cd) ? `<span class="pill ok">Meets all requirements</span>` : `<span class="pill bad">Does not meet all requirements</span>`}${cd.file ? fileChip(cd.file) : ""}
      <div class="meter"><div class="bar"><i style="width:${m}%"></i></div><b>${m}%</b></div></div>
    <div class="tags">${staleTag(cd)}${arr(cd.meets).map(t => `<span class="tagc meets">${esc(t)}</span>`).join("")}${arr(cd.gaps).map(t => `<span class="tagc gap">Missing: ${esc(t)}</span>`).join("")}</div>
    ${cd.summary ? `<p>${esc(cd.summary)}</p>` : ""}</div>`;
}

/* ---------------- evidence: quotes and locations ---------------- */
const STOP = new Set("the and for with that this from have has are was were will shall must our their your into than then also any all each per its not but can may least more less such other who what which where when how been being about".split(" "));
const toks = s => [...new Set(norm(s).split(" ").filter(w => w.length > 2 && !STOP.has(w)))];
/** Splits a document at its [Page N] or [Slide N] markers. */
function segments(d) {
  const t = String((d && d.text) || ""), re = /\[(Page|Slide) (\d+)\]/g, out = [];
  let m, last = 0, label = "";
  while ((m = re.exec(t))) { out.push({ label, text: t.slice(last, m.index).trim() }); label = `${m[1]} ${m[2]}`; last = re.lastIndex; }
  out.push({ label, text: t.slice(last).trim() });
  return out.filter(s => s.text);
}
/** Finds where in a document the proof sits. An AI quote is only "exact" if it really is in the file. */
function findQuote(d, terms, quote) {
  const segs = segments(d);
  if (!segs.length) return { label: "", seg: "", line: "", verified: false };
  const nq = norm(quote);
  if (nq.length > 8) {
    for (const s of segs) {
      if (!norm(s.text).includes(nq)) continue;
      const lines = s.text.split("\n"), head = nq.split(" ").slice(0, 4).join(" ");
      const line = lines.find(l => norm(l).includes(nq)) || lines.find(l => norm(l).includes(head)) || quote;
      return { label: s.label, seg: s.text, line, quote, verified: true, exact: true };
    }
  }
  const tk = toks(`${terms || ""} ${quote || ""}`);
  let best = null;
  segs.forEach(s => s.text.split("\n").forEach(l => {
    const n = " " + norm(l) + " ", hits = tk.filter(w => n.includes(" " + w)).length;
    if (hits && (!best || hits > best.hits || (hits === best.hits && l.length < best.line.length))) best = { label: s.label, seg: s.text, line: l.trim(), hits };
  }));
  if (!best) return { label: segs[0].label, seg: segs[0].text, line: "", verified: false, aiMiss: nq.length > 8 };
  return { ...best, verified: true, exact: false, aiMiss: nq.length > 8 };
}
const locChip = q => (q && q.label ? `<span class="loc">${esc(q.label)}</span>` : "");

/* ---------------- proposal structure ---------------- */
const uid = () => Math.random().toString(36).slice(2, 9);
const SEC_KEYS = { team: /team|personnel|people/i, cred: /credential|experience|reference|case stud/i, comp: /compliance|returnable|mandatory/i, comm: /commercial|pricing|price/i, appr: /approach|method/i, gov: /governance|risk/i, und: /understanding/i, train: /training|skills transfer/i, supp: /support|maintenance/i };
function secKeyForText(t) {
  t = String(t || "");
  if (/price|cost|commercial|financial offer|80\/20|90\/10/i.test(t)) return "comm";
  if (/b-?bbee|specific goals|preference/i.test(t)) return "comp";
  if (/personnel|team|staff|\bcvs?\b|key person|qualification/i.test(t)) return "team";
  if (/experience|reference|credential|similar|track record/i.test(t)) return "cred";
  if (/training|skills transfer|capacity building/i.test(t)) return "train";
  if (/governance|risk|quality assurance/i.test(t)) return "gov";
  return "appr";
}
function findSection(c, key, direct) {
  const s = arr(c.structure).find(x => SEC_KEYS[key] && SEC_KEYS[key].test(x.title));
  if (s || direct) return s || null;
  return key === "train" || key === "supp" ? findSection(c, "appr") : null;
}
function defaultStructure(info) {
  const mk = (title, subs = []) => ({ id: "s" + uid(), title, status: "todo", subs });
  const deliv = arr(info.deliverables).slice(0, 6).map(d => clip(String(d).replace(/\.$/, ""), 80));
  return [mk("Executive summary"), mk("Understanding the requirement"), mk("Our approach and methodology", ["Mobilise", "Assess", "Design", "Build", "Hand over"]),
    mk("Deliverables", deliv), mk("Project governance and risk"), mk("Our team"), mk("Credentials and references"),
    mk("Compliance and returnable documents"), mk("Pricing and commercials"), mk("Appendices")];
}
function ensureExtras(c) {
  if (!c) return;
  c.overrides ||= {}; c.links ||= {}; c.used ||= []; c.dismissed ||= [];
  if (!c.structure && c.steps && c.steps.info && c.steps.info.data) c.structure = defaultStructure(c.steps.info.data);
}
const secById = (c, id) => arr(c.structure).find(s => s.id === id) || null;
const secNo = (c, s) => String(arr(c.structure).indexOf(s) + 1).padStart(2, "0");
/** Covered = a section answers this criterion by name or by topic. */
function coveredBy(c, text) {
  const key = secKeyForText(text), k = findSection(c, key, true);
  if (k) return k;
  const tk = toks(text).filter(w => !/^(plan|proposed|bidder|provide|company)$/.test(w));
  return arr(c.structure).find(s => toks(s.title).some(w => tk.includes(w))) || null;
}
function suggestions(c) {
  const info = (c.steps.info && c.steps.info.data) || {}, out = [], dis = new Set(arr(c.dismissed));
  const add = (title, why) => { const id = "sg:" + norm(title); if (!dis.has(id) && !out.some(o => o.id === id)) out.push({ id, title, why }); };
  arr(info.evaluation).forEach(e => {
    const pts = Number(e.points) || 0; if (!pts || secKeyForText(e.criterion) === "comm") return;
    if (!coveredBy(c, e.criterion)) add(String(e.criterion).replace(/\s*\(.*\)$/, ""), `the RFP scores "${e.criterion}" (${pts} points) and no section answers it yet`);
  });
  if (arr(info.deliverables).some(d => /support|maintenance/i.test(d)) && !findSection(c, "supp", true)) add("Support and maintenance", "the RFP asks for support after go-live");
  if (arr(info.mandatory).length && !findSection(c, "comp", true)) add("Compliance and returnable documents", "the RFP has mandatory documents that must be attached");
  return out.slice(0, 4);
}

/* ---------------- compliance matrix ---------------- */
const ST = { complete: ["ok", "✓", "Complete"], partial: ["warn", "!", "Needs attention"], missing: ["bad", "✕", "Missing"], pending: ["na", "…", "Checking"] };
const stIcon = s => `<span class="sti ${ST[s][0]}" title="${ST[s][2]}" aria-label="${ST[s][2]}">${ST[s][1]}</span>`;
const stPill = s => `<span class="pill ${ST[s][0]}">${ST[s][2]}</span>`;
const pbar = (p, cls = "") => `<div class="pbar ${cls}"><i style="width:${Math.max(0, Math.min(100, Number(p) || 0))}%"></i></div>`;
const pctCls = p => (p >= 85 ? "ok" : p >= 60 ? "warn" : "bad");
const busy = st => !st || st.status === "waiting" || st.status === "working";
const EXPIRED = k => k === "expired" || k === "beforeDeadline";

function matrixRows(c) {
  const info = c && c.steps.info.data; if (!info) return [];
  ensureExtras(c);
  const ev = c.steps.evidence || {}, evDone = !!ev.data, pack = buildPack(c), rows = [];
  const cvSt = c.steps.cv, wkSt = c.steps.work;
  arr(info.mandatory).forEach((m, i) => {
    const pm = pack.mandatory.find(x => x.id === m.id) || pack.mandatory[i];
    let status = "pending", rec = "", issue = "", evid = [], act = false;
    if (pm && evDone) {
      evid = pm.files.map(f => ({ path: f.path, terms: m.evidence || m.requirement, note: f.expiry.key !== "none" ? f.expiry.label : "", cls: f.expiry.cls }));
      const bad = pm.files.find(f => EXPIRED(f.expiry.key));
      if (pm.status === "Found") { status = bad ? "partial" : "complete"; rec = bad ? `${baseName(bad.path)} ${lowerFirst(bad.expiry.label)}. Get a current copy.` : pm.note || "The document is on file."; issue = bad ? `${m.id}: document ${lowerFirst(bad.expiry.label)}` : ""; }
      else if (pm.status === "Not a document") { status = "partial"; act = true; rec = `This is an action, not a document. ${pm.note || ""}`.trim(); issue = `${m.id}: action needed (${clip(m.requirement, 50)})`; }
      else { status = "missing"; rec = pm.note || `No document in the folder proves this. Find or request: ${m.evidence || m.requirement}`; issue = `${m.id}: ${clip(m.requirement, 60)} is missing`; }
    } else if (!busy(ev)) { rec = "The document check did not finish. Run it again on the Overview."; }
    rows.push({ id: "M:" + (m.id || i), ref: m.id || "M" + (i + 1), type: "Mandatory", text: m.requirement, proof: m.evidence, disq: !!m.disqualifying, key: "comp", status, rec, issue, evid, act });
  });
  const cvRoles = arr(cvSt.data && cvSt.data.roles);
  arr(info.roles).forEach((r, i) => {
    const cr = cvRoles.find(x => norm(x.role) === norm(r.role)) || cvRoles.find(x => norm(x.role).includes(norm(r.role)) || norm(r.role).includes(norm(x.role)));
    const p = cr && pack.personnel.find(x => x.role === cr.role);
    const req = [...arr(r.qualifications), ...arr(r.certifications), ...arr(r.registrations), r.minYears ? `${r.minYears}+ years` : "", ...arr(r.experience)].filter(Boolean).join("; ");
    let status = "pending", rec = "", issue = "", evid = [];
    if (cvSt.data) {
      if (!p || !p.name) { status = "missing"; rec = (cr && cr.recommendation) || "No CV meets every requirement for this role. Find a consultant who does, or ask the client whether an equivalent is acceptable."; issue = `No CV meets all requirements for ${r.role}`; }
      else {
        if (p.cv && p.cv.path) evid.push({ path: p.cv.path, terms: req, label: `${p.name} CV`, note: p.cv.st ? (p.cv.st.key === "unknown" ? "No update date" : `CV ${lowerFirst(p.cv.st.label)}`) : "", cls: p.cv.st ? p.cv.st.cls : "na" });
        const probs = [];
        if (p.cv && p.cv.st && p.cv.st.key === "overdue") probs.push("the CV is out of date");
        p.certs.forEach(ct => {
          if (ct.status === "Found" && ct.file) evid.push({ path: ct.file, terms: ct.required, note: ct.expiry ? ct.expiry.label : "", cls: ct.expiry ? ct.expiry.cls : "ok" });
          if (ct.status === "Missing") probs.push(`no ${ct.required} certificate on file`);
          else if (ct.expiry && EXPIRED(ct.expiry.key)) probs.push(`${ct.required} ${lowerFirst(ct.expiry.label)}`);
        });
        status = probs.length ? "partial" : "complete";
        rec = probs.length ? `${p.name} meets the role, but ${probs.join(", ")}. Fix this before you submit.` : `${p.name} meets every stated requirement (${p.match}% match).${evDone ? "" : " Certificates are still being checked."}`;
        issue = probs.length ? `${p.name} (${r.role}): ${probs[0]}` : "";
      }
    } else if (!busy(cvSt)) { status = cvSt.status === "skipped" ? "missing" : "pending"; rec = cvSt.note || "The CV match did not finish. Run it again on the Overview."; issue = status === "missing" ? `${r.role}: ${cvSt.note || "no CVs"}` : ""; }
    rows.push({ id: "R:" + norm(r.role), ref: "Role " + (i + 1), type: "Team", text: `${r.role}${req ? ": " + req : ""}`, roleName: r.role, key: "team", status, rec, issue, evid });
  });
  const wreq = arr(wkSt.data && wkSt.data.requirements);
  arr(info.experienceRequirements).forEach((e, i) => {
    const w = wreq.find(x => x.id && x.id === e.id) || wreq[i];
    let status = "pending", rec = "", issue = "", evid = [];
    if (w) {
      status = /^met$/i.test(w.verdict) ? "complete" : /partly/i.test(w.verdict) ? "partial" : "missing";
      arr(w.matches).forEach(m => {
        evid.push({ path: m.file, quote: m.quote, terms: m.why || e.requirement, label: m.project, note: m.relevance ? `${m.relevance} relevance` : "", cls: pillFor({ High: "high", Medium: "medium", Low: "low" }[m.relevance] || "") });
        if (m.letterFile) evid.push({ path: m.letterFile, terms: m.client || m.project, note: "Reference letter", cls: "ok" });
      });
      rec = [w.explanation, w.action].filter(Boolean).join(" ");
      issue = status === "complete" ? "" : `${e.id || "Experience"}: ${status === "missing" ? "no proof of similar work" : "not enough proof of similar work"}`;
    } else if (!busy(wkSt)) { status = wkSt.status === "skipped" ? "missing" : "pending"; rec = wkSt.note || "The search for past work did not finish. Run it again on the Overview."; issue = status === "missing" ? `${e.id || "Experience"}: no past work found` : ""; }
    rows.push({ id: "E:" + (e.id || i), ref: e.id || "EXP-" + (i + 1), type: "Experience", text: e.requirement, key: "cred", status, rec, issue, evid });
  });
  arr(info.evaluation).forEach((e, i) => {
    const pts = Number(e.points) || 0; if (!pts) return;
    const id = "S:" + norm(e.criterion).slice(0, 40), key = secKeyForText(e.criterion);
    const sec = c.links[id] === "none" ? null : (c.links[id] && secById(c, c.links[id])) || coveredBy(c, e.criterion) || findSection(c, key);
    const status = !sec ? "missing" : sec.status === "done" ? "complete" : "partial";
    const rec = !sec ? `Add a section that answers "${e.criterion}". It is worth ${pts} points.` : status === "complete" ? `Answered in "${sec.title}".` : `Answer this in "${sec.title}". It is worth ${pts} points. Mark the section as done on Proposal structure when it is written.`;
    rows.push({ id, ref: `${pts} pts`, type: "Scored", text: e.criterion, proof: e.detail, points: pts, key, status, rec, sectionId: sec ? sec.id : "", issue: !sec ? `No section answers "${clip(e.criterion, 50)}" (${pts} points)` : status === "partial" ? `"${clip(sec.title, 40)}" not written yet (${pts} points)` : "", evid: [] });
  });
  rows.forEach(r => {
    if (c.links[r.id] === "none") r.sectionId = "";
    else if (!r.sectionId) { const s = (c.links[r.id] && secById(c, c.links[r.id])) || findSection(c, r.key); r.sectionId = s ? s.id : ""; }
    else if (c.links[r.id] && secById(c, c.links[r.id])) r.sectionId = c.links[r.id];
    const o = c.overrides[r.id];
    if (o && ST[o]) { r.auto = r.status; r.status = o; r.overridden = true; if (o === "complete") r.issue = ""; else if (!r.issue) r.issue = `${r.ref}: marked "${ST[o][2].toLowerCase()}"`; }
  });
  return rows;
}

function readiness(c) {
  const info = c && c.steps.info.data, rows = matrixRows(c);
  const sc = s => (s === "complete" ? 1 : s === "partial" ? 0.5 : 0);
  const pct = list => { const l = list.filter(r => r.status !== "pending"); return l.length ? Math.round(100 * l.reduce((n, r) => n + sc(r.status), 0) / l.length) : null; };
  const st = arr(c && c.structure);
  const proposal = st.length ? Math.round(100 * st.reduce((n, s) => n + (s.status === "done" ? 1 : s.status === "attention" ? 0.5 : 0), 0) / st.length) : null;
  let evidence = null;
  if (c && c.steps.evidence && c.steps.evidence.data) {
    const pack = buildPack(c), items = [];
    pack.personnel.forEach(p => {
      if (!p.name) return;
      items.push(p.cv && p.cv.st && p.cv.st.key === "overdue" ? 0.5 : 1);
      p.certs.forEach(ct => { if (ct.status === "Found") items.push(ct.expiry && EXPIRED(ct.expiry.key) ? 0.5 : 1); else if (ct.status === "Missing") items.push(0); });
    });
    pack.mandatory.forEach(m => { if (m.status === "Found") items.push(m.files.some(f => EXPIRED(f.expiry.key)) ? 0.5 : 1); else if (m.status === "Missing") items.push(0); });
    pack.experience.forEach(e => e.items.forEach(i => { if (i.letter === "Found") items.push(1); else if (i.letter === "Not found") items.push(0); }));
    evidence = items.length ? Math.round(100 * items.reduce((a, b) => a + b, 0) / items.length) : 100;
  }
  const A = { rfp: info ? 100 : null, compliance: pct(rows), proposal: info ? proposal : null, team: pct(rows.filter(r => r.type === "Team")), credentials: pct(rows.filter(r => r.type === "Experience")), evidence };
  const W = { rfp: 1, compliance: 3, proposal: 2, team: 2, credentials: 2, evidence: 2 };
  let n = 0, d = 0;
  Object.keys(W).forEach(k => { if (A[k] != null) { n += W[k] * A[k]; d += W[k]; } });
  A.overall = d ? Math.round(n / d) : 0;
  A.label = !info ? "Not analysed" : A.overall >= 85 ? "Ready" : A.overall >= 60 ? "Nearly ready" : "Not ready";
  A.rows = rows;
  return A;
}

/** Critical issues stop a bid. Improvements make it stronger. */
function gaps(c, rows = matrixRows(c)) {
  const crit = [], impr = [];
  rows.forEach(r => {
    if (!r.issue || r.status === "complete" || r.status === "pending") return;
    const item = { text: r.issue, rowId: r.id };
    if (r.status === "missing" && r.type !== "Scored") crit.push(item);
    else if (r.type === "Mandatory" && r.disq && r.status === "partial" && /expired|before the closing/i.test(r.issue)) crit.push(item);
    else impr.push(item);
  });
  arr(c.structure).forEach(s => { if (s.status === "attention") impr.push({ text: `"${s.title}" needs attention`, go: "structure" }); });
  suggestions(c).forEach(s => impr.push({ text: `Suggested section: ${s.title}`, go: "structure" }));
  return { crit, impr };
}

/* ---------------- navigation ---------------- */
const SCREENS = ["home", "overview", "analysis", "requirements", "matrix", "structure", "team", "credentials", "references", "documents", "evidence", "review", "bids", "checks"];
const PROPOSAL = new Set(["overview", "analysis", "requirements", "matrix", "structure", "team", "credentials", "references", "evidence", "review"]);
const TITLES = { home: "Home", overview: "Overview", analysis: "RFP analysis", requirements: "Requirements", matrix: "Compliance matrix", structure: "Proposal structure", team: "Team", credentials: "Credentials", references: "References", documents: "Documents", evidence: "Evidence check", review: "Final review", bids: "Bid tracker", checks: "CV and cert checks" };
const GROUP = { analysis: "RFP", requirements: "RFP", matrix: "RFP", structure: "Build", team: "Evidence", credentials: "Evidence", references: "Evidence", documents: "Evidence", evidence: "Review", review: "Review", bids: "Workspace", checks: "Workspace" };
const ICONS = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14c2.2.6 3.5 2.8 3.5 6"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14l-1.5 7 5-3 5 3-1.5-7"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 014.5 5H9l2 2.5h8.5A1.5 1.5 0 0121 9v9.5a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18.5z"/>',
  check: '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8.5" cy="11" r="2.2"/><path d="M5 16.5c.6-1.6 2-2.4 3.5-2.4s2.9.8 3.5 2.4M14.5 10h4.5M14.5 13.5h3"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
};
const ico = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ""}</svg>`;
document.querySelectorAll("i[data-ico]").forEach(i => { i.innerHTML = ico(i.dataset.ico); });

let screen = "home";
function go(n, keepScroll) {
  if (!SCREENS.includes(n)) n = "home";
  screen = n; closeDrawer();
  document.querySelectorAll(".screen").forEach(s => (s.hidden = s.id !== "scr-" + n));
  document.querySelectorAll(".navi").forEach(b => { b.classList.toggle("on", b.dataset.go === n); if (b.dataset.go === n) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  if (n === "bids") loadBids();
  $("#side").classList.remove("open"); $("#menuBtn").setAttribute("aria-expanded", "false");
  try { history.replaceState(null, "", "#" + n); } catch { /* ignore */ }
  render();
  if (!keepScroll) window.scrollTo(0, 0);
}
/** Older code paths still ask for the old tab names. */
function showTab(n) {
  go({ analyse: "home", repo: "documents", cvs: "checks", certs: "checks", saved: "home" }[n] || n);
  if (n === "cvs" || n === "certs") setCheck(n);
}
function setCheck(k) {
  document.querySelectorAll(".segb").forEach(b => b.setAttribute("aria-selected", String(b.dataset.check === k)));
  $("#check-cvs").hidden = k !== "cvs"; $("#check-certs").hidden = k !== "certs";
}
document.querySelectorAll(".segb").forEach(b => b.addEventListener("click", () => setCheck(b.dataset.check)));
$("#nav").addEventListener("click", e => { const b = e.target.closest("[data-go]"); if (b) go(b.dataset.go); });
$("#menuBtn").addEventListener("click", () => { const o = $("#side").classList.toggle("open"); $("#menuBtn").setAttribute("aria-expanded", String(o)); });
$("#newPropBtn").addEventListener("click", () => {
  if (S.running) { toast("Wait for the current analysis to finish, or press Stop."); return; }
  S.current = null; S.rfpName = ""; $("#rfpText").value = ""; $("#bidTitle").value = ""; $("#rfpMeta").hidden = true;
  go("home"); renderSources(); setTimeout(() => $("#rfpFile").focus(), 0);
});
document.querySelectorAll(".drop").forEach(z => {
  ["dragenter", "dragover"].forEach(e => z.addEventListener(e, () => z.classList.add("over")));
  ["dragleave", "drop"].forEach(e => z.addEventListener(e, () => z.classList.remove("over")));
});

function render() {
  refreshNav(); renderTop(); renderAssist();
  if (screen === "home") { renderRecent(); renderHomeSide(); }
  if (PROPOSAL.has(screen)) renderScreen(screen);
}
function refreshNav() {
  const c = S.current, R = c && c.steps.info.data ? readiness(c) : null, rows = R ? R.rows : [];
  document.querySelectorAll(".navi").forEach(b => b.classList.toggle("dim", PROPOSAL.has(b.dataset.go) && !c));
  $("#navReq").textContent = rows.length || "";
  const miss = rows.filter(r => r.status === "missing").length;
  $("#navMiss").textContent = miss || ""; $("#navMiss").classList.toggle("zero", !miss);
  const due = (Number($("#cvDue").textContent) || 0) + (Number($("#certDue").textContent) || 0);
  $("#checkDue").textContent = due || ""; $("#checkDue").classList.toggle("zero", !due);
  const cp = $("#curProp");
  cp.hidden = !c;
  if (c) cp.innerHTML = `<button type="button" data-go="overview"><span class="lbl">Open proposal</span><b>${esc(c.title)}</b>${R ? `<span class="mini">${pbar(R.overall, pctCls(R.overall))}<em>${R.overall}%</em></span>` : `<span class="mini"><em>${S.running ? "Analysing..." : "Not analysed"}</em></span>`}</button>`;
}
$("#curProp").addEventListener("click", e => { if (e.target.closest("[data-go]")) go("overview"); });
function renderTop() {
  const c = S.current;
  const crumb = GROUP[screen] ? `<span class="grp">${esc(GROUP[screen])}</span><span class="sep">/</span>` : "";
  $("#crumbs").innerHTML = `${crumb}<b>${esc(TITLES[screen] || "")}</b>${c && PROPOSAL.has(screen) ? `<span class="prop">${esc(c.title)}</span>` : ""}`;
  const rs = $("#runState");
  if (S.running && c) {
    const i = STEPS.findIndex(s => c.steps[s.id] && c.steps[s.id].status === "working");
    rs.hidden = false; rs.innerHTML = `<span class="spin" aria-hidden="true"></span>Analysing${i >= 0 ? ` · step ${i + 1} of ${STEPS.length}: ${esc(STEPS[i].title.toLowerCase())}` : ""}`;
  } else rs.hidden = true;
}

/* ---------------- assistant ---------------- */
let assistOpen = false;
function renderAssist() {
  const box = $("#assist"), c = S.current;
  const show = c && c.steps.info.data && PROPOSAL.has(screen) && screen !== "overview" && screen !== "review";
  box.hidden = !show; if (!show) return;
  const g = gaps(c), all = [...g.crit.map(x => ({ ...x, sev: "bad" })), ...g.impr.map(x => ({ ...x, sev: "warn" }))];
  if (!assistOpen) { box.innerHTML = `<button type="button" class="assistpill" data-assist="open">${ico("spark")}Proposal assistant${all.length ? `<span class="n">${all.length}</span>` : ""}</button>`; return; }
  box.innerHTML = window.DOMPurify.sanitize(`<div class="assistcard"><div class="ah">${ico("spark")}<b>Proposal assistant</b><button type="button" class="x" data-assist="close" aria-label="Close">×</button></div>
    ${all.length ? `<p>I found ${all.length === 1 ? "one gap" : `${all.length} gaps`}${all.length > 3 ? ". The first three:" : ":"}</p><ul>${all.slice(0, 3).map(x => `<li class="${x.sev}"><button type="button" ${x.rowId ? `data-row="${esc(x.rowId)}"` : `data-go2="${esc(x.go || "matrix")}"`}>${esc(x.text)}</button></li>`).join("")}</ul>
    <button type="button" class="btn small primary" data-go2="matrix" data-filter="${g.crit.length ? "missing" : "partial"}">Review gaps</button>` : `<p>No gaps found. Run the final review before you submit.</p><button type="button" class="btn small primary" data-go2="review">Final review</button>`}</div>`);
}
$("#assist").addEventListener("click", e => {
  const a = e.target.closest("[data-assist]"); if (a) { assistOpen = a.dataset.assist === "open"; renderAssist(); return; }
  handleJump(e);
});
/** Shared by the assistant, overview and review lists. */
function handleJump(e) {
  const r = e.target.closest("[data-row]"); if (r) { openRowPanel(r.dataset.row); return true; }
  const g = e.target.closest("[data-go2]"); if (g) { if (g.dataset.filter) MX.filter = g.dataset.filter; go(g.dataset.go2); return true; }
  return false;
}

/* ---------------- home ---------------- */
let pendingRun = null;
function hydrate(r) {
  return { ...r, docs: null, steps: Object.fromEntries(STEPS.map(s => [s.id, { ...(r.steps[s.id] || { status: "skipped", note: "This analysis was saved before this step existed. Run it again to add it." }) }])) };
}
let homeBidsAsked = false;
function renderHomeSide() {
  const box = $("#homeSide"); if (!box) return;
  const docs = allDocs(), k = counts(docs), cvDue = Number($("#cvDue").textContent) || 0, certDue = Number($("#certDue").textContent) || 0;
  const st = B.loaded ? bidStats(B.list) : null;
  if (!B.loaded && S.token && !homeBidsAsked) { homeBidsAsked = true; loadBids().then(() => { if (screen === "home") renderHomeSide(); }); }
  const steps = [["Upload the RFP", "PDF, Word or PowerPoint."], ["AI reads the requirements", "Mandatory items, roles, scoring and deliverables."], ["Review the compliance matrix", "See what is complete, partial or missing."], ["Build the proposal structure", "Reorder sections. The AI suggests gaps."], ["Match CVs, credentials and evidence", "Every match links to its proof."], ["Run the final review and export", "Fix the critical issues first."]];
  const stat = (n, l, go, cls = "") => `<button type="button" class="gl ${cls}" data-go2="${go}"><b>${n}</b><span>${esc(l)}</span></button>`;
  box.innerHTML = window.DOMPurify.sanitize(`
    <div class="box pad"><p class="eyebrow">Workspace at a glance</p>
      <div class="glance">
        ${stat(k.cv, "CVs on file", "documents")}${stat(k.project, "Credentials and projects", "credentials")}
        ${stat(cvDue, "CVs out of date", "checks", cvDue ? "bad" : "ok")}${stat(certDue, "Certificate problems", "checks", certDue ? "bad" : "ok")}
        ${st ? stat(st.inProgress + st.awaiting, "Bids open", "bids") + stat(st.winRate == null ? "n/a" : st.winRate + "%", "Win rate", "bids", st.winRate == null ? "" : "ok") : ""}
      </div>
      <p class="note">Searching: ${esc(sourcesLabel())}.</p>
    </div>
    <div class="box pad"><p class="eyebrow">How it works</p><ol class="howto">${steps.map(([t, d]) => `<li><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join("")}</ol>
      <p class="note">The AI recommends. Your team decides. The app does not write proposal text.</p></div>`);
}
$("#homeSide").addEventListener("click", e => handleJump(e));
function renderRecent() {
  const box = $("#recentList");
  if (!S.runs.length) { box.innerHTML = `<div class="box empty">No proposals yet. Upload an RFP above, or load the sample tender to try it.</div>`; return; }
  box.innerHTML = window.DOMPurify.sanitize(`<div class="box recentbox">${S.runs.map(r => {
    const c = S.current && S.current.id === r.id ? S.current : hydrate(r), R = readiness(c), x = r.steps.info && r.steps.info.data || {}, ci = closingInfo(x);
    return `<div class="rp ${S.current && S.current.id === r.id ? "cur" : ""}"><button type="button" class="rpmain" data-open="${esc(r.id)}"><b>${esc(r.title)}</b><span>${esc([isNA(x.client) ? "" : x.client, ci ? ci.text : "", fmtDate(r.createdAt)].filter(Boolean).join(" · "))}</span></button>
      <div class="rpready"><div class="rpp"><b class="${pctCls(R.overall)}">${R.overall}%</b> ${esc(R.label === "Ready" ? "Ready" : "ready")}</div>${pbar(R.overall, pctCls(R.overall))}</div>
      <button class="btn small ${pendingRun === r.id ? "danger" : "ghost"}" data-rdel="${esc(r.id)}" type="button" aria-label="Delete ${esc(r.title)}">${pendingRun === r.id ? "Confirm delete" : "Delete"}</button></div>`;
  }).join("")}</div><p class="note">Proposals are saved in this browser. Use Export on Final review to share one.</p>`);
}
$("#recentList").addEventListener("click", e => {
  const o = e.target.closest("[data-open]");
  if (o) {
    if (S.running) { toast("Wait for the current analysis to finish."); return; }
    const r = S.runs.find(x => x.id === o.dataset.open); if (!r) return;
    S.current = S.current && S.current.id === r.id ? S.current : hydrate(r); ensureExtras(S.current); go("overview"); return;
  }
  const d = e.target.closest("[data-rdel]");
  if (d) {
    const id = d.dataset.rdel;
    if (pendingRun !== id) { pendingRun = id; renderRecent(); return; }
    pendingRun = null; S.runs = S.runs.filter(r => r.id !== id); store.set("bdRuns", S.runs);
    if (S.current && S.current.id === id && !S.running) S.current = null;
    render(); toast("Deleted");
  }
});

/* ---------------- proposal screens ---------------- */
const head = (eyebrow, title, note, actions = "") => `<div class="pagehead"><div><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1>${note ? `<p class="note">${note}</p>` : ""}</div>${actions ? `<div class="row">${actions}</div>` : ""}</div>`;
function stepWait(c, id, what) {
  const st = c.steps[id] || { status: "waiting" };
  const msg = st.status === "working" ? st.progress || "Working..." : st.status === "waiting" ? `This fills in when the "${STEPS.find(s => s.id === id).title.toLowerCase()}" step runs.` : st.status === "skipped" ? st.note || "Skipped." : st.error || "This step did not finish.";
  return `<div class="box empty ${st.status === "working" ? "working" : ""}">${st.status === "working" ? `<span class="spin" aria-hidden="true"></span>` : ""}<p>${esc(msg)}</p>${["error", "stopped"].includes(st.status) && !S.running ? `<button class="btn small" data-rerun="${id}" type="button">Run this step again</button>` : ""}${what ? `<p class="note">${esc(what)}</p>` : ""}</div>`;
}
function renderScreen(n) {
  const el = $("#scr-" + n), c = S.current;
  let html;
  if (!c) html = `${head(GROUP[n] || "Proposal", TITLES[n])}<div class="box empty"><p>No proposal is open.</p><p class="note">Upload an RFP on the Home screen, or open a recent proposal.</p><button class="btn primary" type="button" data-go2="home">Go to Home</button></div>`;
  else { ensureExtras(c); html = ({ overview: scrOverview, analysis: scrAnalysis, requirements: scrRequirements, matrix: scrMatrix, structure: scrStructure, team: scrTeam, credentials: scrCredentials, references: scrReferences, evidence: scrEvidence, review: scrReview })[n](c); }
  const focusId = document.activeElement && el.contains(document.activeElement) ? document.activeElement.id : "";
  const caret = focusId && document.activeElement.selectionStart;
  el.innerHTML = window.DOMPurify.sanitize(html);
  if (focusId) { const f = document.getElementById(focusId); if (f) { f.focus(); try { f.setSelectionRange(caret, caret); } catch { /* ignore */ } } }
}
document.querySelector(".main").addEventListener("click", e => {
  if (handleJump(e)) return;
  const r = e.target.closest("[data-rerun]"); if (r) { rerun(r.dataset.rerun); return; }
  const d = e.target.closest("[data-dl]"); if (d) { download(d.dataset.dl); return; }
});

/* Overview */
function scrOverview(c) {
  const info = c.steps.info.data;
  const steps = `<div class="box pad"><p class="eyebrow">AI analysis</p><ul class="steplist">${STEPS.map((s, i) => { const st = c.steps[s.id] || { status: "waiting" }; return `<li class="st-${st.status}"><span class="dot">${st.status === "done" ? "✓" : st.status === "working" ? "" : i + 1}</span><div><b>${esc(s.title)}</b><span>${esc(st.status === "working" ? st.progress || "Working..." : st.status === "skipped" ? st.note || "Skipped" : st.status === "error" ? st.error || "Failed" : STATUS[st.status])}</span></div>${["error", "stopped"].includes(st.status) && !S.running ? `<button class="btn small" data-rerun="${s.id}" type="button">Run again</button>` : ""}</li>`; }).join("")}</ul></div>`;
  if (!info) return `${head("Proposal", c.title, esc(c.rfpName || "Pasted tender"))}<div class="ovgrid"><div>${stepWait(c, "info", "The overview fills in once the RFP has been read.")}</div><div>${steps}</div></div>`;
  const R = readiness(c), rows = R.rows, g = gaps(c, rows), ci = closingInfo(info);
  const cnt = k => rows.filter(r => r.status === k).length;
  const areaVal = v => (v == null ? `<span class="aval na">Waiting</span>` : `<span class="aval"><b>${v}%</b>${pbar(v, pctCls(v))}</span>`);
  const areas = [
    ["RFP analysis", "analysis", R.rfp === 100 ? `<span class="aval"><span class="sti ok">✓</span> Done</span>` : areaVal(R.rfp)],
    ["Compliance", "matrix", areaVal(R.compliance)], ["Proposal structure", "structure", areaVal(R.proposal)], ["Team", "team", areaVal(R.team)],
    ["Credentials", "credentials", areaVal(R.credentials)], ["Evidence", "evidence", areaVal(R.evidence)],
    ["Final review", "review", c.review ? `<span class="aval"><span class="sti ok">✓</span> ${esc(fmtDate(c.review.at))}</span>` : `<span class="aval na">Not started</span>`],
  ];
  const all = [...g.crit.map(x => ({ ...x, sev: "bad" })), ...g.impr.map(x => ({ ...x, sev: "warn" }))];
  return `${head("Proposal overview", c.title, `${esc([isNA(info.client) ? "" : info.client, isNA(info.reference) ? "" : info.reference].filter(Boolean).join(" · "))}`,
      `${c.bidId ? `<button class="btn small" type="button" data-go2="bids">Open in bid tracker</button>` : ""}<button class="btn small primary" type="button" data-go2="matrix">Open compliance matrix</button>`)}
    <div class="ovgrid"><div class="ovmain">
      <div class="box pad readybox">
        <div class="readyhead"><div><p class="eyebrow">Overall readiness</p><p class="readylbl ${pctCls(R.overall)}">${esc(R.label)}</p></div><b class="big ${pctCls(R.overall)}">${R.overall}%</b></div>
        ${pbar(R.overall, "lg " + pctCls(R.overall))}
        <div class="kpi3">
          <button type="button" class="okpi" data-go2="requirements"><b>${rows.length}</b><span>Requirements</span></button>
          <button type="button" class="okpi warn" data-go2="matrix" data-filter="partial"><b>${cnt("partial")}</b><span>Partial</span></button>
          <button type="button" class="okpi bad" data-go2="matrix" data-filter="missing"><b>${cnt("missing")}</b><span>Missing</span></button>
        </div>
        ${cnt("pending") ? `<p class="note">${cnt("pending")} still being checked.</p>` : ""}
        <ul class="areas">${areas.map(([l, s, v]) => `<li><button type="button" data-go2="${s}"><span class="al">${esc(l)}</span>${v}</button></li>`).join("")}</ul>
      </div>
    </div><div class="ovside">
      <div class="box pad assistin"><div class="ah">${ico("spark")}<b>Proposal assistant</b></div>
        ${S.running ? `<p class="note">Still analysing. Gaps appear as each step finishes.</p>` : ""}
        ${all.length ? `<p>I found ${all.length === 1 ? "one gap" : `${all.length} gaps`}:</p><ul>${all.slice(0, 5).map(x => `<li class="${x.sev}"><button type="button" ${x.rowId ? `data-row="${esc(x.rowId)}"` : `data-go2="${esc(x.go || "matrix")}"`}>${esc(x.text)}</button></li>`).join("")}</ul>${all.length > 5 ? `<p class="note">and ${all.length - 5} more.</p>` : ""}
          <button type="button" class="btn small primary" data-go2="matrix" data-filter="${g.crit.length ? "missing" : "partial"}">Review gaps</button>` : S.running ? "" : `<p>No gaps found so far.</p>`}
      </div>
      ${ci ? `<div class="box pad"><p class="eyebrow">Key dates</p><dl class="facts one">${fact("Closing date", info.submissionDeadline, `<br><span class="countdown ${ci.days < 0 ? "late" : ""}">${esc(ci.text)}</span>`)}${isNA(info.briefingSession) ? "" : fact("Briefing session", info.briefingSession)}</dl></div>` : ""}
      ${steps}
    </div></div>`;
}

/* RFP analysis */
function scrAnalysis(c) {
  const x = c.steps.info.data;
  return `${head("RFP", "RFP analysis", `${esc(c.rfpName || "Pasted tender")} · analysed ${esc(fmtDate(c.createdAt))}`, `<button class="btn small" data-rerun="info" type="button" ${S.running ? "disabled" : ""}>Read the RFP again</button>`)}
    ${x ? `<div class="vstack">${viewAnalysis(x)}</div>` : stepWait(c, "info")}`;
}

/* Requirements */
function scrRequirements(c) {
  const x = c.steps.info.data; if (!x) return `${head("RFP", "Requirements")}${stepWait(c, "info")}`;
  const rows = matrixRows(c), by = t => rows.filter(r => r.type === t);
  const line = r => `<li><button type="button" class="reqline" data-row="${esc(r.id)}"><span class="ref">${esc(r.ref)}</span><span class="txt">${esc(r.text)}${r.disq ? ` <span class="pill bad">Disqualifying</span>` : ""}</span>${stPill(r.status)}</button></li>`;
  const group = (t, title, note) => by(t).length ? `<section class="box pad"><div class="grouphead"><h2>${esc(title)}</h2><span class="note">${esc(note)}</span></div><ul class="reqlist">${by(t).map(line).join("")}</ul></section>` : "";
  return `${head("RFP", "Requirements", `Everything the RFP asks for, in one list. ${rows.length} requirements found. Click one to see the evidence.`)}
    <div class="vstack">
      ${group("Mandatory", "Mandatory requirements", "Pass or fail. Missing one can disqualify the bid.")}
      ${group("Team", "Key personnel", "Roles the client wants CVs for.")}
      ${group("Experience", "Previous work", "Proof of similar projects the client asks for.")}
      ${group("Scored", "Scored criteria", "How the proposal earns points.")}
      ${!rows.length ? `<div class="box empty">No requirements were found in the RFP.</div>` : ""}
    </div>`;
}

/* Compliance matrix */
const MX = { filter: "all", type: "all", q: "" };
function scrMatrix(c) {
  if (!c.steps.info.data) return `${head("RFP", "Compliance matrix")}${stepWait(c, "info")}`;
  const rows = matrixRows(c), n = k => rows.filter(r => r.status === k).length;
  const types = ["Mandatory", "Team", "Experience", "Scored"];
  const shown = rows.filter(r => (MX.filter === "all" || r.status === MX.filter) && (MX.type === "all" || r.type === MX.type) && (!MX.q || norm(r.text + " " + r.ref).includes(norm(MX.q))));
  const evLabel = r => {
    if (r.status === "pending") return `<span class="evnote">Checking...</span>`;
    if (r.act && !r.evid.length) return `<span class="evnote">Action, not a document</span>`;
    if (!r.evid.length) return r.type === "Scored" ? `<span class="evnote">${r.sectionId ? "Written answer" : "None"}</span>` : `<span class="evmiss">Missing</span>`;
    const f = r.evid[0];
    return `<span class="evfirst">${esc(f.label || baseName(f.path))}</span>${r.evid.length > 1 ? `<span class="evmore">+${r.evid.length - 1}</span>` : ""}`;
  };
  const chip = (k, l, cnt) => `<button type="button" class="chip ${MX.filter === k ? "on" : ""}" data-mf="${k}">${esc(l)} <span>${cnt}</span></button>`;
  return `${head("RFP", "Compliance matrix", "Every requirement, where the proposal answers it, and the proof. Click a row for the detail. You can change any status.")}
    <div class="box mxbox">
      <div class="mxbar">
        <div class="chips">${chip("all", "All", rows.length)}${chip("missing", "Missing", n("missing"))}${chip("partial", "Partial", n("partial"))}${chip("complete", "Complete", n("complete"))}${n("pending") ? chip("pending", "Checking", n("pending")) : ""}</div>
        <div class="mxfil"><select id="mxType" aria-label="Requirement type"><option value="all">All types</option>${types.map(t => `<option value="${t}" ${MX.type === t ? "selected" : ""}>${t === "Team" ? "Key personnel" : t === "Experience" ? "Previous work" : t}</option>`).join("")}</select>
        <input type="search" id="mxSearch" placeholder="Search requirements" aria-label="Search requirements" value="${esc(MX.q)}"></div>
      </div>
      <div class="tbl"><table class="mx"><thead><tr><th>Requirement</th><th>Section</th><th>Evidence</th><th class="c">Status</th></tr></thead><tbody>
        ${shown.map(r => { const s = secById(c, r.sectionId); return `<tr data-row="${esc(r.id)}" tabindex="0"><td><span class="ref">${esc(r.ref)}</span> ${esc(clip(r.text, 140))}${r.text.length > 140 ? "..." : ""}<span class="ty">${esc(r.type === "Team" ? "Key personnel" : r.type === "Experience" ? "Previous work" : r.type)}</span></td><td>${s ? `<span class="secname">${secNo(c, s)} ${esc(s.title)}</span>` : `<span class="evmiss">No section</span>`}</td><td>${evLabel(r)}</td><td class="c">${stIcon(r.status)}${r.overridden ? `<span class="ovr" title="Set by hand">edited</span>` : ""}</td></tr>`; }).join("") || `<tr><td colspan="4" class="evnote">Nothing matches this filter.</td></tr>`}
      </tbody></table></div>
    </div>`;
}
document.querySelector("#scr-matrix").addEventListener("click", e => { const f = e.target.closest("[data-mf]"); if (f) { MX.filter = f.dataset.mf; render(); } });
document.querySelector("#scr-matrix").addEventListener("change", e => { if (e.target.id === "mxType") { MX.type = e.target.value; render(); } });
document.querySelector("#scr-matrix").addEventListener("input", e => { if (e.target.id === "mxSearch") { MX.q = e.target.value; render(); } });
document.querySelector("#scr-matrix").addEventListener("keydown", e => { const r = e.target.closest("tr[data-row]"); if (r && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openRowPanel(r.dataset.row); } });

/* Side panel */
let drawerRow = null, drawerWhy = null;
function openDrawer(kind, title, html) {
  $("#drawerKind").textContent = kind; $("#drawerTitle").textContent = title;
  $("#drawerBody").innerHTML = window.DOMPurify.sanitize(html);
  $("#drawer").hidden = false; $("#scrim").hidden = false;
  requestAnimationFrame(() => $("#drawer").classList.add("in"));
  $("#drawerClose").focus();
}
function closeDrawer() { drawerRow = null; drawerWhy = null; $("#drawer").classList.remove("in"); $("#drawer").hidden = true; $("#scrim").hidden = true; }
$("#drawerClose").addEventListener("click", closeDrawer);
$("#scrim").addEventListener("click", closeDrawer);
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#drawer").hidden && !document.querySelector("dialog[open]")) closeDrawer(); });

function evList(items) {
  return items.length ? `<ul class="evlist">${items.map((f, i) => `<li><button type="button" class="filechip" data-evi="${i}">${esc(f.label || baseName(f.path))}</button>${f.note ? `<span class="pill ${esc(f.cls || "na")}">${esc(f.note)}</span>` : ""}</li>`).join("")}</ul>` : `<p class="evnote">No supporting documents found.</p>`;
}
function openRowPanel(id) {
  const c = S.current; if (!c) return;
  const r = matrixRows(c).find(x => x.id === id); if (!r) return;
  drawerRow = r; drawerWhy = null;
  const secOpts = arr(c.structure).map(s => `<option value="${esc(s.id)}" ${s.id === r.sectionId ? "selected" : ""}>${secNo(c, s)} ${esc(s.title)}</option>`).join("");
  const o = c.overrides[r.id] || "";
  openDrawer(`${r.ref} · ${r.type === "Team" ? "Key personnel" : r.type === "Experience" ? "Previous work" : r.type}`, "Requirement detail", `
    <section><h3>RFP requirement</h3><p>${esc(r.text)}</p>${r.proof ? `<p class="note">${r.type === "Scored" ? "Detail" : "Proof asked for"}: ${esc(r.proof)}</p>` : ""}
      <div class="row">${stPill(r.status)}${r.disq ? `<span class="pill bad">Disqualifying if missed</span>` : ""}${r.points ? `<span class="pill na">${r.points} points</span>` : ""}</div></section>
    <section class="airec"><h3>${ico("spark")} Recommendation</h3><p>${esc(r.rec || "No recommendation yet.")}</p></section>
    <section><h3>Evidence found</h3><p class="note">${r.evid.length ? `${r.evid.length} document${r.evid.length === 1 ? "" : "s"}. Click one to see the proof.` : ""}</p>${evList(r.evid)}</section>
    <section class="ctrl"><div><label for="rpSec">Proposal section</label><select id="rpSec"><option value="">Not in the proposal</option>${secOpts}</select></div>
      <div><label for="rpSt">Status</label><select id="rpSt"><option value="">Automatic (${esc(ST[r.auto || r.status][2].toLowerCase())})</option>${["complete", "partial", "missing"].map(k => `<option value="${k}" ${o === k ? "selected" : ""}>${ST[k][2]}</option>`).join("")}</select></div></section>
    <div class="row drawerfoot"><button class="btn" type="button" data-evi="0" ${r.evid.length ? "" : "disabled"}>View evidence</button><button class="btn primary" type="button" id="rpAdd">Add to proposal</button></div>`);
}
$("#drawerBody").addEventListener("click", e => {
  const c = S.current;
  const v = e.target.closest("[data-evi]");
  if (v && drawerRow) { const f = drawerRow.evid[Number(v.dataset.evi)]; if (f) openEvidence({ path: f.path, quote: f.quote, terms: f.terms || drawerRow.text, title: f.label || drawerRow.text }); return; }
  if (v && drawerWhy) { const f = drawerWhy.items[Number(v.dataset.evi)]; if (f) openEvidence(f); return; }
  if (e.target.id === "rpAdd" && drawerRow && c) {
    const sid = $("#rpSec").value || drawerRow.sectionId;
    if (!sid) { toast("Choose a proposal section first."); return; }
    c.links[drawerRow.id] = sid; saveRun(true);
    const s = secById(c, sid); toast(`Added to ${secNo(c, s)} ${s.title}`); closeDrawer(); render();
  }
  const wa = e.target.closest("[data-use]"); if (wa) { toggleUse(JSON.parse(wa.dataset.use)); openWhy(drawerWhy.key); }
});
$("#drawerBody").addEventListener("change", e => {
  const c = S.current; if (!c || !drawerRow) return;
  if (e.target.id === "rpSec") { if (e.target.value) c.links[drawerRow.id] = e.target.value; else c.links[drawerRow.id] = "none"; }
  if (e.target.id === "rpSt") { if (e.target.value) c.overrides[drawerRow.id] = e.target.value; else delete c.overrides[drawerRow.id]; }
  saveRun(true); const id = drawerRow.id; render(); openRowPanel(id);
});

/* Proposal structure */
let dragFrom = null, openSec = null, pendingSecDel = null;
function scrStructure(c) {
  if (!c.steps.info.data) return `${head("Build", "Proposal structure")}${stepWait(c, "info")}`;
  const st = c.structure, rows = matrixRows(c), sg = suggestions(c), R = readiness(c);
  const STS = { done: ["ok", "✓", "Done"], attention: ["warn", "!", "Needs attention"], todo: ["na", "○", "Not started"] };
  return `${head("Build", "Proposal structure", "The outline of your proposal. Drag sections to reorder them, click the status to change it, and open a section to see what it must answer.",
      `<button class="btn primary" type="button" data-addsec>+ Add section</button>`)}
    <div class="box pad"><div class="readyhead"><p class="eyebrow">Sections written</p><b class="mid ${pctCls(R.proposal || 0)}">${R.proposal || 0}% complete</b></div>${pbar(R.proposal || 0, pctCls(R.proposal || 0))}</div>
    ${sg.length ? `<div class="box pad suggest"><div class="ah">${ico("spark")}<b>Suggested by the AI</b><span class="note">The AI recommends. Your team decides.</span></div>
      ${sg.map(s => `<div class="sgrow"><p>Add <b>"${esc(s.title)}"</b> because ${esc(s.why)}.</p><div class="row"><button class="btn small primary" type="button" data-sgadd="${esc(s.id)}" data-sgtitle="${esc(s.title)}">Add section</button><button class="btn small ghost" type="button" data-sgx="${esc(s.id)}">Dismiss</button></div></div>`).join("")}</div>` : ""}
    <ol class="secs" id="outline">${st.map((s, i) => {
      const linked = rows.filter(r => r.sectionId === s.id), used = arr(c.used).filter(u => u.section === s.id);
      const worst = linked.some(r => r.status === "missing") ? "bad" : linked.some(r => r.status === "partial") ? "warn" : linked.length ? "ok" : "na";
      const [cls, icon, label] = STS[s.status] || STS.todo;
      return `<li class="sec" data-i="${i}">
        <div class="secrow"><span class="handle" draggable="true" data-drag="${i}" title="Drag to move" aria-hidden="true">≡</span><span class="no">${String(i + 1).padStart(2, "0")}</span>
          <input type="text" class="sectitle" id="st-${esc(s.id)}" data-stitle="${esc(s.id)}" value="${esc(s.title)}" aria-label="Section ${i + 1} title">
          ${linked.length || used.length ? `<button type="button" class="linkchip ${worst}" data-sexp="${esc(s.id)}">${linked.length ? `${linked.length} requirement${linked.length === 1 ? "" : "s"}` : ""}${linked.length && used.length ? " · " : ""}${used.length ? `${used.length} evidence` : ""}</button>` : ""}
          <button type="button" class="secst ${cls}" data-sst="${esc(s.id)}" title="Click to change the status"><span class="sti ${cls}">${icon}</span><span>${label}</span></button>
          <span class="secbtns"><button type="button" class="btn small ghost" data-smove="${i}:-1" aria-label="Move up" ${i ? "" : "disabled"}>↑</button><button type="button" class="btn small ghost" data-smove="${i}:1" aria-label="Move down" ${i < st.length - 1 ? "" : "disabled"}>↓</button><button type="button" class="btn small ghost" data-sexp="${esc(s.id)}" aria-expanded="${openSec === s.id}">${openSec === s.id ? "Close" : "Open"}</button></span>
        </div>
        ${arr(s.subs).length && openSec !== s.id ? `<ul class="subs">${arr(s.subs).map((x, j) => `<li>${i + 1}.${j + 1} ${esc(x)}</li>`).join("")}</ul>` : ""}
        ${openSec === s.id ? `<div class="secopen">
          <div><label for="subs-${esc(s.id)}">Sub-sections (one per line)</label><textarea id="subs-${esc(s.id)}" data-ssubs="${esc(s.id)}" rows="4">${esc(arr(s.subs).join("\n"))}</textarea></div>
          <div><p class="lbl">What this section must answer</p>${linked.length ? `<ul class="reqlist">${linked.map(r => `<li><button type="button" class="reqline" data-row="${esc(r.id)}"><span class="ref">${esc(r.ref)}</span><span class="txt">${esc(clip(r.text, 120))}</span>${stIcon(r.status)}</button></li>`).join("")}</ul>` : `<p class="evnote">No requirements linked. Link them from the compliance matrix.</p>`}
          ${used.length ? `<p class="lbl">Evidence added</p><ul class="evlist">${used.map(u => `<li>${fileChip(u.path)}<span class="evnote">${esc(u.label)}</span></li>`).join("")}</ul>` : ""}
          <div class="row end"><button type="button" class="btn small danger" data-sdel="${esc(s.id)}">${pendingSecDel === s.id ? "Confirm delete" : "Delete section"}</button></div></div>` : ""}
      </li>`;
    }).join("")}</ol>`;
}
const scrS = $("#scr-structure");
function structEdit(fn) { const c = S.current; if (!c || !c.structure) return; fn(c, c.structure); saveRun(true); render(); }
scrS.addEventListener("click", e => {
  const t = e.target.closest("[data-sst],[data-smove],[data-sexp],[data-sdel],[data-addsec],[data-sgadd],[data-sgx]"); if (!t) return;
  if (t.dataset.sst) structEdit((c, st) => { const s = st.find(x => x.id === t.dataset.sst); s.status = { todo: "attention", attention: "done", done: "todo" }[s.status] || "attention"; });
  else if (t.dataset.smove) structEdit((c, st) => { const [i, d] = t.dataset.smove.split(":").map(Number), j = i + d; if (j < 0 || j >= st.length) return; [st[i], st[j]] = [st[j], st[i]]; });
  else if (t.dataset.sexp) { openSec = openSec === t.dataset.sexp ? null : t.dataset.sexp; pendingSecDel = null; render(); }
  else if (t.dataset.sdel) {
    if (pendingSecDel !== t.dataset.sdel) { pendingSecDel = t.dataset.sdel; render(); return; }
    structEdit((c, st) => { const i = st.findIndex(x => x.id === t.dataset.sdel); if (i >= 0) st.splice(i, 1); Object.keys(c.links).forEach(k => { if (c.links[k] === t.dataset.sdel) delete c.links[k]; }); pendingSecDel = null; openSec = null; });
  }
  else if (t.hasAttribute("data-addsec")) { const s = { id: "s" + uid(), title: "New section", status: "todo", subs: [] }; structEdit((c, st) => st.push(s)); openSec = s.id; render(); setTimeout(() => { const f = document.getElementById("st-" + s.id); if (f) { f.focus(); f.select(); } }, 0); }
  else if (t.dataset.sgadd) {
    structEdit((c, st) => { const at = Math.max(0, st.findIndex(x => SEC_KEYS.comm.test(x.title))); st.splice(at || st.length, 0, { id: "s" + uid(), title: t.dataset.sgtitle, status: "todo", subs: [] }); });
    toast(`Added "${t.dataset.sgtitle}"`);
  }
  else if (t.dataset.sgx) structEdit(c => { c.dismissed.push(t.dataset.sgx); });
});
scrS.addEventListener("change", e => {
  const ti = e.target.closest("[data-stitle]"); if (ti) { structEdit((c, st) => { const s = st.find(x => x.id === ti.dataset.stitle); if (s) s.title = clip(ti.value.trim(), 120) || s.title; }); return; }
  const sb = e.target.closest("[data-ssubs]"); if (sb) structEdit((c, st) => { const s = st.find(x => x.id === sb.dataset.ssubs); if (s) s.subs = sb.value.split("\n").map(x => clip(x.trim(), 120)).filter(Boolean).slice(0, 20); });
});
scrS.addEventListener("keydown", e => { if (e.target.matches("[data-stitle]") && e.key === "Enter") e.target.blur(); });
scrS.addEventListener("dragstart", e => {
  const h = e.target.closest && e.target.closest("[data-drag]"); if (!h) return;
  dragFrom = Number(h.dataset.drag); const li = h.closest(".sec"); li.classList.add("dragging");
  try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(dragFrom)); e.dataTransfer.setDragImage(li, 20, 20); } catch { /* ignore */ }
});
scrS.addEventListener("dragover", e => { const li = e.target.closest(".sec"); if (li && dragFrom != null) { e.preventDefault(); scrS.querySelectorAll(".sec.over").forEach(x => x !== li && x.classList.remove("over")); li.classList.add("over"); } });
scrS.addEventListener("dragleave", e => { const li = e.target.closest(".sec"); if (li && !li.contains(e.relatedTarget)) li.classList.remove("over"); });
scrS.addEventListener("drop", e => {
  const li = e.target.closest(".sec"); if (!li || dragFrom == null) return; e.preventDefault();
  const to = Number(li.dataset.i), from = dragFrom; dragFrom = null;
  if (from !== to) structEdit((c, st) => { const [m] = st.splice(from, 1); st.splice(to, 0, m); });
  else render();
});
scrS.addEventListener("dragend", () => { dragFrom = null; scrS.querySelectorAll(".dragging,.over").forEach(x => x.classList.remove("dragging", "over")); });

/* Using evidence in the proposal */
function isUsed(u) { const c = S.current; return !!(c && arr(c.used).some(x => x.path === u.path && x.kind === u.kind && (x.role || "") === (u.role || ""))); }
function toggleUse(u) {
  const c = S.current; if (!c) return;
  ensureExtras(c);
  if (isUsed(u)) { c.used = c.used.filter(x => !(x.path === u.path && x.kind === u.kind && (x.role || "") === (u.role || ""))); toast("Removed from the proposal"); }
  else {
    const s = findSection(c, u.kind === "cv" ? "team" : "cred") || arr(c.structure)[0];
    c.used.push({ ...u, section: s ? s.id : "" }); toast(s ? `Added to ${secNo(c, s)} ${s.title}` : "Added to the proposal");
  }
  saveRun(true); render();
}
const useBtn = u => `<button type="button" class="btn small ${isUsed(u) ? "added" : "primary"}" data-use="${esc(JSON.stringify(u))}">${isUsed(u) ? "✓ Added" : "Add to proposal"}</button>`;
document.querySelector(".main").addEventListener("click", e => {
  const u = e.target.closest("[data-use]"); if (u) { toggleUse(JSON.parse(u.dataset.use)); return; }
  const p = e.target.closest("[data-ev]"); if (p) { openEvidence(JSON.parse(p.dataset.ev)); return; }
  const w = e.target.closest("[data-why]"); if (w) { openWhy(w.dataset.why); }
});

/* Team */
const candKey = (role, name) => `${role}::${name}`;
function projectsFor(name) {
  const n = norm(name); if (!n) return [];
  return allDocs().filter(d => d.kind === "project" && norm(d.text).includes(n));
}
function scrTeam(c) {
  const cv = c.steps.cv.data; if (!cv) return `${head("Evidence", "Team")}${stepWait(c, "cv", "Only CVs that meet every stated requirement of a role are put forward.")}`;
  const roles = arr(cv.roles);
  return `${head("Evidence", "Recommended team", "Only CVs that meet every stated requirement of a role are put forward. Click a match score to see why the person matched, with the proof from their CV.")}
    <div class="vstack">${roles.map(r => {
      const ok = matchingCvs(r), near = nearMisses(r);
      return `<section class="teamrole"><div class="grouphead"><h2>${esc(r.role)}</h2>${r.requirementSummary ? `<span class="note">${esc(r.requirementSummary)}</span>` : ""}</div>
        <div class="cards">${ok.length ? ok.map(cd => {
          const m = Math.max(0, Math.min(100, Number(cd.match) || 0)), doc = docForCandidate(cd), projs = projectsFor(cd.name);
          const u = { kind: "cv", path: doc ? doc.path : cd.file || "", label: `${cd.name} (${r.role})`, role: r.role };
          return `<article class="box mcard"><div class="mtop"><div><b class="mname">${esc(cd.name)}</b><span class="pill ok">Meets all requirements</span></div>
              <button type="button" class="score" data-why="${esc(candKey(r.role, cd.name))}" title="Why this person matched">${m}%</button></div>
            ${pbar(m, "ok")}
            <ul class="ticks">${arr(cd.meets).slice(0, 6).map(t => `<li>${esc(t)}</li>`).join("")}</ul>
            <div class="tags">${staleTag(cd)}</div>
            <p class="note">Evidence: ${projs.length ? `named in ${projs.length} past project report${projs.length === 1 ? "" : "s"}` : "no past project reports name this person"}.</p>
            <div class="row">${doc ? `<button type="button" class="btn small" data-view="${esc(doc.path)}">View CV</button>` : ""}<button type="button" class="btn small ghost" data-why="${esc(candKey(r.role, cd.name))}">Why this match</button><span class="grow"></span>${u.path ? useBtn(u) : ""}</div></article>`;
        }).join("") : `<div class="nomatch nomatch-bad"><b>No CV meets all the requirements for this role.</b> Find a consultant who does, or ask the client whether an equivalent is acceptable.</div>`}</div>
        ${near.length ? `<details class="near"><summary>${near.length === 1 ? "1 closest CV that does not" : near.length + " closest CVs that do not"} meet all requirements (not recommended)</summary>${near.map(candCard).join("")}</details>` : ""}
      </section>`;
    }).join("")}</div>`;
}
function openWhy(key) {
  const c = S.current; if (!c || !c.steps.cv.data) return;
  const [role, name] = key.split("::");
  const r = arr(c.steps.cv.data.roles).find(x => x.role === role), cd = r && arr(r.candidates).find(x => x.name === name);
  if (!cd) return;
  const doc = docForCandidate(cd), pack = buildPack(c), p = pack.personnel.find(x => x.role === role && x.name === name);
  const items = [];
  const reqs = arr(cd.evidence).length ? arr(cd.evidence).map(e => ({ req: e.requirement, quote: e.quote })) : arr(cd.meets).map(m => ({ req: m, quote: "" }));
  const lines = reqs.map(x => {
    const q = doc ? findQuote(doc, x.req, x.quote) : null;
    const ok = q && q.verified && q.line;
    items.push({ path: doc ? doc.path : "", quote: x.quote, terms: x.req, title: `${name}: ${x.req}` });
    return `<tr><td><b>${esc(x.req)}</b></td><td>${ok ? `<button type="button" class="quote" data-evi="${items.length - 1}">"${esc(clip(q.line, 150))}"</button>${q.exact ? `<span class="pill ok">Confirmed in CV</span>` : q.aiMiss ? `<span class="pill warn">Closest line in the CV. Check it.</span>` : `<span class="pill ok">Found in CV</span>`}` : `<span class="pill warn">Not found in the CV text. Check by hand.</span>`}</td></tr>`;
  }).join("");
  drawerWhy = { key, items }; drawerRow = null;
  const projs = projectsFor(name), u = { kind: "cv", path: doc ? doc.path : cd.file || "", label: `${name} (${role})`, role };
  openDrawer(role, `Why ${name} matched`, `
    <section><div class="row"><b class="bigscore">${esc(cd.match)}%</b><span class="pill ok">Meets all requirements</span></div>${cd.summary ? `<p>${esc(cd.summary)}</p>` : ""}</section>
    <section><h3>Requirement and proof</h3><div class="tbl"><table class="why"><thead><tr><th>Requirement</th><th>Evidence</th></tr></thead><tbody>${lines || `<tr><td colspan="2" class="evnote">The AI gave no detail for this match.</td></tr>`}</tbody></table></div>
      <p class="note">Every quote is checked against the CV text. Click a quote to see it in the CV.</p></section>
    ${p && p.certs.length ? `<section><h3>Certificates on file</h3><ul class="evlist">${p.certs.map(ct => `<li><span class="evlabel">${esc(ct.required)}</span>${ct.status === "Found" && ct.file ? fileChip(ct.file) : ""}${ct.status === "Found" ? (ct.expiry ? `<span class="pill ${ct.expiry.cls}">${esc(ct.expiry.label)}</span>` : `<span class="pill ok">Found</span>`) : pill(ct.status === "Missing" ? "Not found" : ct.status)}</li>`).join("")}</ul></section>` : ""}
    <section><h3>Past projects naming ${esc(name)}</h3>${projs.length ? `<ul class="evlist">${projs.map(d => `<li>${fileChip(d.path)}</li>`).join("")}</ul>` : `<p class="evnote">None in the folder.</p>`}</section>
    <div class="row drawerfoot">${doc ? `<button type="button" class="btn" data-view="${esc(doc.path)}">View CV</button>` : ""}${u.path ? useBtn(u) : ""}</div>`);
}

/* Credentials */
const CR = { q: "" };
const STRENGTH = { High: ["strong", "Strong match"], Medium: ["good", "Good match"], Low: ["poss", "Possible match"] };
function credCard(o) {
  const u = { kind: "cred", path: o.path, label: o.title };
  return `<article class="box ccard ${o.cls}"><span class="badge ${o.cls}">${o.cls === "strong" ? "★ " : ""}${esc(o.badge)}</span>
    <h3>${esc(o.title)}</h3>${o.meta ? `<p class="note">${esc(o.meta)}</p>` : ""}
    ${o.because.length ? `<p class="lbl">Relevant because:</p><ul class="ticks">${o.because.map(b => `<li class="${b.no ? "no" : b.unk ? "unk" : ""}">${esc(b.t)}</li>`).join("")}</ul>` : ""}
    ${o.q && o.q.line ? `<p class="qline">${locChip(o.q)}"${esc(clip(o.q.line, 160))}"</p>` : ""}
    <div class="row"><button type="button" class="btn small" data-ev="${esc(JSON.stringify({ path: o.path, quote: o.quote || "", terms: o.terms || "", title: o.title }))}">Preview</button><span class="grow"></span>${useBtn(u)}</div></article>`;
}
function credSearch(q) {
  const tk = toks(q); if (!tk.length) return [];
  const best = {};
  allDocs().filter(d => d.kind === "project").forEach(d => segments(d).forEach(s => {
    const n = " " + norm(s.text) + " ", hit = tk.filter(w => n.includes(" " + w)); if (!hit.length) return;
    const score = hit.length + (norm(s.text).includes(norm(q)) ? 2 : 0);
    if (!best[d.path] || score > best[d.path].score) best[d.path] = { d, s, hit, score };
  }));
  return Object.values(best).sort((a, b) => b.score - a.score).slice(0, 8).map(x => {
    const q2 = findQuote({ text: (x.s.label ? `[${x.s.label}]\n` : "") + x.s.text }, q);
    return { path: x.d.path, title: x.d.title || baseName(x.d.path), meta: x.s.label ? `${baseName(x.d.path)} · ${x.s.label}` : baseName(x.d.path), terms: q, q: q2, full: x.hit.length === tk.length,
      because: tk.map(w => ({ t: w, no: !x.hit.includes(w) })) };
  });
}
function scrCredentials(c) {
  const w = c.steps.work.data, info = c.steps.info.data || {};
  const recs = [], seen = new Set();
  arr(w && w.requirements).forEach(r => arr(r.matches).forEach(m => {
    if (!m.file || seen.has(m.file)) return; seen.add(m.file);
    const d = findDoc(m.file), [cls, badge] = STRENGTH[m.relevance] || STRENGTH.Low, q = d ? findQuote(d, m.why || r.requirement, m.quote) : null;
    recs.push({ rel: m.relevance, path: d ? d.path : m.file, title: m.project || baseName(m.file), meta: [m.client, m.year, m.value].filter(v => v && !isNA(v)).join(" · "), cls, badge, quote: m.quote, terms: m.why || r.requirement, q,
      because: [...arr(m.checks).map(ck => ({ t: ck.rule, no: ck.result === "No", unk: ck.result === "Unknown" })), ...(m.why ? [{ t: m.why }] : []), { t: `Supports ${r.id || "the requirement"}` }].slice(0, 6) });
  }));
  const top = recs.filter(r => r.rel === "High" || r.rel === "Medium"), low = recs.filter(r => !(r.rel === "High" || r.rel === "Medium"));
  const extra = shortlist(allDocs().filter(d => d.kind === "project" && !seen.has(d.path)), [...arr(info.searchTerms), ...arr(info.deliverables).flatMap(d => String(d).split(/[,;]/))], 5).picked.filter(p => p.score > 0);
  const others = [...low.map(o => credRow(o.path, o.title, o.badge, o.q)), ...extra.map(p => credRow(p.d.path, p.d.title || baseName(p.d.path), `${p.hits.length} matching terms`, findQuote(p.d, p.hits.join(" "))))];
  const res = CR.q.trim() ? credSearch(CR.q) : null;
  return `${head("Evidence", "Credentials", "Past projects and credential decks that prove we have done this before. PowerPoint decks are read slide by slide, so you see the exact slide.")}
    <div class="box pad searchbox"><label for="crSearch">Search all credentials</label><input type="search" id="crSearch" placeholder="e.g. revenue dashboards on Fabric" value="${esc(CR.q)}"></div>
    ${res ? `<section class="vstack"><div class="grouphead"><h2>Search results</h2><span class="note">${res.length} found for "${esc(CR.q)}"</span></div>
      ${res.length ? `<div class="cards">${res.filter(r => r.full).slice(0, 3).map(r => credCard({ ...r, cls: "strong", badge: "Strong match" })).join("")}</div>
        ${res.filter(r => !r.full).length || res.filter(r => r.full).length > 3 ? `<h3 class="subh">Other possible matches</h3><div class="box">${[...res.filter(r => r.full).slice(3), ...res.filter(r => !r.full)].map(r => credRow(r.path, r.title, `${r.because.filter(b => !b.no).length} of ${r.because.length} words`, r.q)).join("")}</div>` : ""}` : `<div class="box empty">Nothing found. Try other words.</div>`}</section>` : ""}
    <section class="vstack"><div class="grouphead"><h2>Recommended for this RFP</h2><span class="note">Chosen by the AI against the RFP's experience requirements.</span></div>
      ${w ? (top.length ? `<div class="cards">${top.map(credCard).join("")}</div>` : `<div class="box empty">No strong credentials found for this RFP.</div>`) : stepWait(c, "work")}
      ${others.length ? `<h3 class="subh">Other possible matches</h3><div class="box">${others.join("")}</div>` : ""}</section>`;
}
function credRow(path, title, why, q) {
  return `<div class="crow"><div><b>${esc(title)}</b><span class="note">${esc(why)}${q && q.label ? ` · ${esc(q.label)}` : ""}</span></div><div class="row"><button type="button" class="btn small" data-ev="${esc(JSON.stringify({ path, terms: q && q.line ? q.line : title, title }))}">Preview</button>${useBtn({ kind: "cred", path, label: title })}</div></div>`;
}
let crT;
document.querySelector("#scr-credentials").addEventListener("input", e => { if (e.target.id === "crSearch") { CR.q = e.target.value; clearTimeout(crT); crT = setTimeout(render, 200); } });

/* References */
function scrReferences(c) {
  const w = c.steps.work.data, letters = allDocs().filter(d => d.kind === "letter");
  const uses = {}, missing = [];
  arr(w && w.requirements).forEach(r => arr(r.matches).forEach(m => {
    if (m.letterFile) { const d = findDoc(m.letterFile); const k = d ? d.path : m.letterFile; (uses[k] ||= []).push({ project: m.project || baseName(m.file), req: r.id }); }
    else if (m.referenceLetter === "Not found") missing.push({ project: m.project || baseName(m.file), client: m.client, req: r.id });
  }));
  const asksLetters = arr(c.steps.info.data && c.steps.info.data.experienceRequirements).some(e => /reference|letter/i.test(e.requirement)) || /reference letter/i.test(JSON.stringify((c.steps.info.data || {}).evaluation || ""));
  return `${head("Evidence", "References", "Signed reference letters that back up our credentials.")}
    ${asksLetters ? `<div class="box pad callout"><b>This RFP asks for signed reference letters.</b> Each project you use as proof needs one.</div>` : ""}
    ${missing.length ? `<section class="box pad"><div class="grouphead"><h2>Letters still needed</h2><span class="note">Projects used as proof that have no letter in the folder.</span></div><ul class="reqlist">${missing.map(m => `<li><div class="reqline static"><span class="sti bad">✕</span><span class="txt"><b>${esc(m.project)}</b>${m.client && !isNA(m.client) ? ` · ${esc(m.client)}` : ""}<span class="note">Ask the client for a signed letter (${esc(m.req || "experience")}).</span></span></div></li>`).join("")}</ul></section>` : ""}
    <section class="vstack"><div class="grouphead"><h2>Letters on file</h2><span class="note">${letters.length} in the folder</span></div>
      ${!w ? stepWait(c, "work") : ""}
      <div class="cards">${letters.map(d => {
        const us = uses[d.path] || [], q = findQuote(d, us.map(u => u.project).join(" ") || d.title);
        return `<article class="box ccard ${us.length ? "strong" : ""}"><span class="badge ${us.length ? "strong" : "poss"}">${us.length ? "Supports this RFP" : "Not used for this RFP"}</span><h3>${esc(d.title)}</h3>
          ${us.length ? `<ul class="ticks">${us.map(u => `<li>${esc(u.project)}${u.req ? ` (${esc(u.req)})` : ""}</li>`).join("")}</ul>` : ""}
          ${q.line ? `<p class="qline">"${esc(clip(q.line, 140))}"</p>` : ""}
          <div class="row"><button type="button" class="btn small" data-ev="${esc(JSON.stringify({ path: d.path, terms: q.line || d.title, title: d.title }))}">Preview</button><span class="grow"></span>${useBtn({ kind: "cred", path: d.path, label: d.title })}</div></article>`;
      }).join("") || `<div class="box empty">No reference letters in the folder.</div>`}</div></section>`;
}

/* Evidence check */
function scrEvidence(c) {
  const st = c.steps.evidence;
  return `${head("Review", "Evidence check", "The right CV, certificates and proof of similar work for each requirement, with expiry dates checked against the closing date.", `<button class="btn small" data-rerun="evidence" type="button" ${S.running || !c.steps.info.data ? "disabled" : ""}>Check documents again</button>`)}
    ${st && st.data ? `<div class="box pad">${viewEvidence(st.data, st)}</div>` : stepWait(c, "evidence")}`;
}

/* Final review */
function scrReview(c) {
  if (!c.steps.info.data) return `${head("Review", "Final review")}${stepWait(c, "info")}`;
  const R = readiness(c), g = gaps(c, R.rows);
  const bars = [["Compliance", R.compliance], ["Requirements met", R.rows.length ? Math.round(100 * R.rows.filter(r => r.status === "complete").length / R.rows.length) : null], ["Credentials", R.credentials], ["Team", R.team], ["Evidence", R.evidence], ["Proposal structure", R.proposal]];
  const item = (x, sev) => `<li class="${sev}"><button type="button" ${x.rowId ? `data-row="${esc(x.rowId)}"` : `data-go2="${esc(x.go || "matrix")}"`}><span class="sti ${sev}">${sev === "bad" ? "✕" : "!"}</span>${esc(x.text)}</button></li>`;
  return `${head("Review", "Final review", "Check the proposal against the RFP before you submit.")}
    <div class="revgrid">
      <div class="box pad revscore"><p class="eyebrow">Proposal readiness</p>
        <div class="ring ${pctCls(R.overall)}" style="--p:${R.overall}"><div><b>${R.overall}%</b><span>${esc(R.label.toUpperCase())}</span></div></div>
        ${c.review ? `<p class="note">Last review ${esc(fmtDate(c.review.at))}: ${c.review.score}%.</p>` : `<p class="note">Not reviewed yet.</p>`}
        <div class="col"><button class="btn primary" type="button" id="runReview" ${S.running ? "disabled" : ""}>Run final review</button><button class="btn" type="button" data-dl="html">Export proposal pack</button><button class="btn link" type="button" data-dl="md">Download as text (.md)</button></div>
      </div>
      <div class="box pad"><p class="eyebrow">By area</p><ul class="revbars">${bars.map(([l, v]) => `<li><span>${esc(l)}</span>${v == null ? `<em class="na">Waiting</em>` : `<b>${v}%</b>${pbar(v, pctCls(v))}`}</li>`).join("")}</ul></div>
    </div>
    <section class="box pad"><div class="grouphead"><h2>Critical issues</h2><span class="note">These can disqualify the bid or lose many points.</span></div>${g.crit.length ? `<ul class="issues">${g.crit.map(x => item(x, "bad")).join("")}</ul>` : `<p class="okline"><span class="sti ok">✓</span> No critical issues.</p>`}</section>
    <section class="box pad"><div class="grouphead"><h2>Recommended improvements</h2><span class="note">These make the proposal stronger.</span></div>${g.impr.length ? `<ul class="issues">${g.impr.map(x => item(x, "warn")).join("")}</ul>` : `<p class="okline"><span class="sti ok">✓</span> Nothing else to improve.</p>`}</section>`;
}
document.querySelector("#scr-review").addEventListener("click", e => { if (e.target.id === "runReview") runFinalReview(); });
async function runFinalReview() {
  const c = S.current; if (!c || S.running) return;
  if (!S.token) { showGate(""); return; }
  if (!c.docs) c.docs = allDocs();
  S.ctls = []; setRunning(true); toast("Checking the documents again...");
  await stepEvidence();
  setRunning(false);
  const R = readiness(c); c.review = { at: Date.now(), score: R.overall };
  saveRun(true); render(); toast(`Final review done: ${R.overall}% ready`);
}

/* Evidence viewer */
function openEvidence(o) {
  const d = findDoc(o.path); if (!d) { toast("That file is not in the loaded folder."); return; }
  const q = findQuote(d, o.terms || o.title || "", o.quote);
  const slide = /^Slide/.test(q.label || "");
  const lines = String(q.seg || "").split("\n").map(l => l.trim()).filter(Boolean);
  const mark = l => (q.line && l.trim() === String(q.line).trim() ? `<mark>${esc(l)}</mark>` : esc(l));
  const preview = slide
    ? `<div class="slide"><span class="slno">${esc(q.label)}</span><h4>${mark(lines[0] || "")}</h4><ul>${lines.slice(1, 9).map(l => `<li>${mark(l)}</li>`).join("")}</ul></div>`
    : `<div class="pageprev">${q.label ? `<span class="slno">${esc(q.label)}</span>` : ""}${lines.slice(0, 40).map(l => `<p>${mark(l)}</p>`).join("")}</div>`;
  $("#evTitle").textContent = o.title || d.title || baseName(d.path);
  $("#evBody").innerHTML = window.DOMPurify.sanitize(`
    <dl class="facts evfacts"><div class="fact"><dt>Source</dt><dd>${esc(baseName(d.path))}<span class="note">${esc(KIND_ONE[d.kind] || "Document")} · ${esc(dirOf(d.path))}</span></dd></div><div class="fact"><dt>Location</dt><dd>${esc(q.label || "Whole document")}</dd></div></dl>
    ${preview}
    <div class="relev"><p class="lbl">Relevant evidence</p>${q.line ? `<blockquote>"${esc(q.line)}"</blockquote>` : `<p class="evnote">No matching line was found in this file.</p>`}
      ${q.verified && q.line ? `<p class="verified"><span class="sti ok">✓</span> Verified source: this text is in the file${q.exact ? " exactly as the AI quoted it" : ""}.</p>` : ""}
      ${q.aiMiss ? `<p class="unverified"><span class="sti warn">!</span> The AI's quote was not found word for word in the file. The closest line is shown. Check it before you use it.</p>` : ""}</div>`);
  const acts = $("#evActions"); acts.innerHTML = "";
  const open = document.createElement("button"); open.className = "btn"; open.type = "button"; open.textContent = "Open full document";
  open.addEventListener("click", () => { $("#evDialog").close(); openDoc(d.path); });
  acts.appendChild(open);
  if (S.current && ["project", "letter", "cv"].includes(d.kind)) {
    const u = d.kind === "cv" ? null : { kind: "cred", path: d.path, label: d.title || baseName(d.path) };
    if (u) {
      const b = document.createElement("button"); b.className = "btn " + (isUsed(u) ? "added" : "primary"); b.type = "button"; b.textContent = isUsed(u) ? "✓ Added to proposal" : "Add to proposal";
      b.addEventListener("click", () => { toggleUse(u); b.className = "btn " + (isUsed(u) ? "added" : "primary"); b.textContent = isUsed(u) ? "✓ Added to proposal" : "Add to proposal"; });
      acts.appendChild(b);
    }
  }
  if (!$("#evDialog").open) $("#evDialog").showModal();
}
$("#evClose").addEventListener("click", () => $("#evDialog").close());

/* ---------------- running ---------------- */
function setRunning(on) { S.running = on; $("#stopBtn").hidden = !on; $("#runBtn").textContent = on ? "Analysing..." : "Analyse RFP"; renderSources(); paint(); }
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
    st.data = d; st.status = "done";
    trackFromAnalysis(S.current);
    return true;
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
/* ---------------- bid tracker (shared, stored on the backend) ---------------- */
const BID_STATUS = [
  ["in_progress", "In progress"], ["submitted", "Submitted, awaiting outcome"], ["won", "Won"],
  ["lost", "Lost"], ["withdrawn", "Withdrawn"], ["no_bid", "No-bid"],
];
const statusLabel = k => (BID_STATUS.find(x => x[0] === k) || [k, k])[1];
const BID_FILTERS = [["all", "All"], ["in_progress", "In progress"], ["submitted", "Awaiting outcome"], ["won", "Won"], ["lost", "Lost"], ["other", "Withdrawn or no-bid"]];
let BID_REASONS = ["Price", "Functionality score below threshold", "Mandatory requirement not met", "B-BBEE / specific goals points", "Experience or references", "Key personnel", "Late or incomplete submission", "Project cancelled by client", "Other"];
const B = { list: [], loaded: false, loading: null, filter: "all", q: "", editing: null, error: "" };
const fmtR = n => (n == null ? "" : "R " + Math.round(n).toLocaleString("en-ZA"));
const fmtRShort = n => (n >= 1e6 ? `R ${(n / 1e6).toFixed(1).replace(/\.0$/, "")}m` : n >= 1e3 ? `R ${Math.round(n / 1e3)}k` : fmtR(n));
const dayFmt = iso => (iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "");

async function loadBids(force) {
  if (!S.token) { B.error = "Sign in to see the shared bid tracker."; renderBids(); return; }
  if (B.loaded && !force) { renderBids(); return; }
  if (B.loading) return B.loading;
  $("#bidTable").innerHTML = `<p class="emptybig">Loading the bid tracker...</p>`;
  B.loading = (async () => {
    try {
      const j = await api("/api/bids/list", {});
      B.list = arr(j.bids); if (arr(j.reasons).length) BID_REASONS = j.reasons; B.loaded = true; B.error = "";
    } catch (e) { B.error = errCopy(e && e.code); }
    B.loading = null; renderBids();
  })();
  return B.loading;
}
async function saveBidRemote(bid) {
  const j = await api("/api/bids/save", { bid });
  const i = B.list.findIndex(b => b.id === j.bid.id);
  if (i >= 0) B.list[i] = j.bid; else B.list.push(j.bid);
  renderBids();
  return j.bid;
}

/** Each analysed tender is added to the tracker once, as "In progress". */
async function trackFromAnalysis(c) {
  if (!c || c.bidId || !S.token) return;
  const x = c.steps.info.data || {};
  try {
    await loadBids();
    const ref = String(x.reference || "").trim().toLowerCase();
    const same = ref && !isNA(ref) ? B.list.find(b => (b.reference || "").trim().toLowerCase() === ref) : null;
    const bid = same || await saveBidRemote({
      title: !isNA(x.project) && x.project ? x.project : c.title, client: isNA(x.client) ? "" : x.client || "",
      reference: isNA(x.reference) ? "" : x.reference || "", sector: isNA(x.industry) ? "" : x.industry || "",
      closingDate: /^\d{4}-\d{2}-\d{2}$/.test(x.submissionDeadlineISO || "") ? x.submissionDeadlineISO : "",
      status: "in_progress", analysisId: c.id, notes: `Added from the analysis "${c.title}".`,
    });
    c.bidId = bid.id; saveRun();
    const ob = $("#openBid"); if (ob) ob.hidden = false;
    toast(same ? "Linked to an existing bid in the tracker" : "Added to the bid tracker");
  } catch { /* the tracker is optional; the analysis still works */ }
}

function bidStats(list) {
  const n = k => list.filter(b => b.status === k).length;
  const won = list.filter(b => b.status === "won"), lost = n("lost"), decided = won.length + lost;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const soon = list.filter(b => b.status === "in_progress" && b.closingDate && (new Date(b.closingDate + "T00:00:00") - today) / DAY <= 14 && new Date(b.closingDate + "T00:00:00") >= today);
  const reasons = {};
  list.filter(b => b.status === "lost").forEach(b => { const r = b.reason || "Not recorded"; reasons[r] = (reasons[r] || 0) + 1; });
  const sectors = {};
  list.filter(b => b.status === "won" || b.status === "lost").forEach(b => { const s = b.sector || "Not recorded"; (sectors[s] ||= { won: 0, total: 0 }); sectors[s].total++; if (b.status === "won") sectors[s].won++; });
  return {
    total: list.length, inProgress: n("in_progress"), awaiting: n("submitted"), won: won.length, lost, decided,
    submitted: n("submitted") + won.length + lost, other: n("withdrawn") + n("no_bid"),
    winRate: decided ? Math.round((won.length / decided) * 100) : null,
    valueWon: won.reduce((t, b) => t + (b.value || 0), 0),
    valueLost: list.filter(b => b.status === "lost").reduce((t, b) => t + (b.value || 0), 0),
    soon, reasons, sectors,
  };
}

function renderBids() {
  $("#bidCount").textContent = B.loaded ? B.list.filter(b => b.status === "in_progress" || b.status === "submitted").length : "";
  if (B.error && !B.loaded) {
    $("#bidKpis").innerHTML = ""; $("#bidCharts").innerHTML = ""; $("#bidFilter").innerHTML = ""; $("#bidFoot").innerHTML = "";
    $("#bidTable").innerHTML = `<p class="emptybig">${esc(B.error)}</p>`; return;
  }
  if (!B.loaded) return;
  const st = bidStats(B.list);
  $("#bidKpis").innerHTML = `
    <div class="kpi"><dt>Proposals submitted</dt><dd>${st.submitted}</dd><span class="sub">${st.inProgress} more in progress</span></div>
    <div class="kpi won"><dt>Won</dt><dd>${st.won}</dd><span class="sub">${st.valueWon ? fmtRShort(st.valueWon) + " in contracts" : "No value recorded"}</span></div>
    <div class="kpi lost"><dt>Lost</dt><dd>${st.lost}</dd><span class="sub">${st.valueLost ? fmtRShort(st.valueLost) + " missed" : "&nbsp;"}</span></div>
    <div class="kpi"><dt>Win rate</dt><dd>${st.winRate == null ? "n/a" : st.winRate + "%"}</dd><span class="sub">${st.decided ? `${st.won} of ${st.decided} decided bids` : "No outcomes yet"}</span></div>
    <div class="kpi"><dt>Awaiting outcome</dt><dd>${st.awaiting}</dd><span class="sub">Submitted, no result yet</span></div>
    <div class="kpi"><dt>Closing in 14 days</dt><dd>${st.soon.length}</dd><span class="sub">${st.soon.length ? esc(st.soon.map(b => b.client || b.title).slice(0, 2).join(", ")) : "Nothing due soon"}</span></div>`;

  const seg = (v, cls) => (v ? `<i class="${cls}" style="flex:${v}" title="${v}"></i>` : "");
  const reasons = Object.entries(st.reasons).sort((a, b) => b[1] - a[1]), maxR = Math.max(1, ...reasons.map(r => r[1]));
  const sectors = Object.entries(st.sectors).sort((a, b) => b[1].total - a[1].total).slice(0, 6);
  $("#bidCharts").innerHTML = `
    <div class="chart"><h4>All bids by status</h4>
      <div class="stack" role="img" aria-label="${st.won} won, ${st.lost} lost, ${st.awaiting} awaiting, ${st.inProgress} in progress, ${st.other} withdrawn or no-bid">${seg(st.won, "seg-won")}${seg(st.lost, "seg-lost")}${seg(st.awaiting, "seg-sub")}${seg(st.inProgress, "seg-prog")}${seg(st.other, "seg-other")}</div>
      <div class="legend"><span style="--sw:var(--ok)">Won ${st.won}</span><span style="--sw:var(--bad)">Lost ${st.lost}</span><span style="--sw:var(--brand-3)">Awaiting ${st.awaiting}</span><span style="--sw:#9db4d3">In progress ${st.inProgress}</span><span style="--sw:#c7d2e0">Withdrawn or no-bid ${st.other}</span></div>
    </div>
    <div class="chart"><h4>Why we lost</h4>${reasons.length ? `<ul class="barlist">${reasons.map(([r, v]) => `<li><span class="lbl" title="${esc(r)}">${esc(r)}</span><span class="bar bad"><i style="width:${Math.round((v / maxR) * 100)}%"></i></span><span class="v">${v}</span></li>`).join("")}</ul>` : `<p class="note">No lost bids recorded yet.</p>`}</div>
    <div class="chart"><h4>Win rate by sector</h4>${sectors.length ? `<ul class="barlist">${sectors.map(([s, v]) => `<li><span class="lbl" title="${esc(s)}">${esc(s)}</span><span class="bar"><i style="width:${Math.round((v.won / v.total) * 100)}%"></i></span><span class="v">${v.won}/${v.total}</span></li>`).join("")}</ul>` : `<p class="note">No decided bids yet.</p>`}</div>`;

  const counts = { all: B.list.length, in_progress: st.inProgress, submitted: st.awaiting, won: st.won, lost: st.lost, other: st.other };
  $("#bidFilter").innerHTML = BID_FILTERS.map(([k, l]) => `<button class="fchip" type="button" data-bidfilter="${k}" aria-pressed="${B.filter === k}">${esc(l)}<span class="c">${counts[k]}</span></button>`).join("");

  const q = B.q.trim().toLowerCase();
  const rows = B.list.filter(b => (B.filter === "all" || (B.filter === "other" ? ["withdrawn", "no_bid"].includes(b.status) : b.status === B.filter))
      && (!q || [b.title, b.client, b.reference, b.sector, b.owner].join(" ").toLowerCase().includes(q)))
    .sort((a, b) => {
      const rank = x => ({ in_progress: 0, submitted: 1 })[x.status] ?? 2;
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (rank(a) < 2) return (a.closingDate || "9999").localeCompare(b.closingDate || "9999");
      return (b.outcomeDate || b.updatedAt || "").localeCompare(a.outcomeDate || a.updatedAt || "");
    });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  $("#bidTable").innerHTML = rows.length ? `<div class="tbl" style="border:0;border-radius:0"><table class="bidtable"><thead><tr><th>Bid</th><th>Closing date</th><th>Status</th><th>Value</th><th>Outcome and feedback</th><th></th></tr></thead><tbody>
    ${rows.map(b => {
      const days = b.closingDate ? Math.round((new Date(b.closingDate + "T00:00:00") - today) / DAY) : null;
      const soon = b.status === "in_progress" && days != null && days >= 0 && days <= 14;
      const outcome = b.status === "won" ? `<b>Won${b.outcomeDate ? " " + esc(dayFmt(b.outcomeDate)) : ""}${b.score ? ", score " + esc(b.score) : ""}</b>${esc(clip(b.feedback, 140))}`
        : ["lost", "no_bid", "withdrawn"].includes(b.status) ? `<b>${esc(b.reason || statusLabel(b.status))}${b.score ? ", score " + esc(b.score) : ""}</b>${esc(clip(b.feedback || b.notes, 140))}`
        : b.status === "submitted" ? `Submitted ${esc(dayFmt(b.submittedDate))}` : "";
      return `<tr>
        <td class="bidname"><b>${esc(b.title)}${b.example ? `<span class="ex">Example</span>` : ""}</b><span>${esc([b.client, b.reference].filter(Boolean).join(" · "))}</span></td>
        <td class="num ${soon ? "soon" : ""}">${b.closingDate ? esc(dayFmt(b.closingDate)) + (soon ? `<br>${days === 0 ? "today" : days + " days left"}` : "") : "Not set"}</td>
        <td><select class="st-${esc(b.status)}" data-bidstatus="${esc(b.id)}" aria-label="Status of ${esc(b.title)}">${BID_STATUS.map(([k, l]) => `<option value="${k}" ${b.status === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></td>
        <td class="num">${b.value != null ? esc(fmtR(b.value)) : ""}</td>
        <td class="outcome">${outcome}</td>
        <td><button class="btn small" type="button" data-bidedit="${esc(b.id)}">Edit</button></td>
      </tr>`;
    }).join("")}</tbody></table></div>`
    : `<p class="emptybig">${B.list.length ? "No bids match this filter." : "No bids yet. Analyse a tender or press New bid."}</p>`;
  const ex = B.list.filter(b => b.example).length;
  $("#bidFoot").innerHTML = `<span>${B.list.length} bids · shared with everyone who signs in</span>${ex ? `<button class="btn small danger" type="button" id="clearExamples">Remove the ${ex} example bids</button>` : ""}`;
}

function openBidDialog(bid) {
  B.editing = bid || null;
  const b = bid || { status: "in_progress" };
  $("#bidDlgKind").textContent = bid ? (bid.example ? "Example bid" : "Bid") : "New bid";
  $("#bidDlgTitle").textContent = bid ? bid.title : "Add a bid";
  $("#bfStatus").innerHTML = BID_STATUS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("");
  $("#bfReason").innerHTML = `<option value="">Not recorded</option>` + BID_REASONS.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join("");
  const set = (id, v) => { $(id).value = v == null ? "" : v; };
  set("#bfTitle", b.title); set("#bfClient", b.client); set("#bfRef", b.reference); set("#bfSector", b.sector); set("#bfOwner", b.owner);
  set("#bfStatus", b.status); set("#bfValue", b.value != null ? Number(b.value).toLocaleString("en-ZA") : ""); set("#bfClosing", b.closingDate);
  set("#bfSubmitted", b.submittedDate); set("#bfOutcome", b.outcomeDate); set("#bfScore", b.score); set("#bfReason", b.reason);
  set("#bfFeedback", b.feedback); set("#bfNotes", b.notes);
  $("#bidDelete").hidden = !bid; $("#bidDelete").textContent = "Delete"; $("#bidDelete").dataset.confirm = "";
  syncReasonRow();
  $("#bidDialog").showModal(); setTimeout(() => $("#bfTitle").focus(), 0);
}
function syncReasonRow() { $("#bfReasonRow").hidden = !["lost", "no_bid", "withdrawn"].includes($("#bfStatus").value); }
$("#bfStatus").addEventListener("change", syncReasonRow);
$("#bidCancel").addEventListener("click", () => $("#bidDialog").close());
$("#bidForm").addEventListener("submit", async e => {
  e.preventDefault();
  const title = $("#bfTitle").value.trim();
  if (!title) { toast("Add a bid name."); $("#bfTitle").focus(); return; }
  const v = $("#bfValue").value.replace(/[^0-9.]/g, "");
  const bid = { ...(B.editing || {}), title, client: $("#bfClient").value, reference: $("#bfRef").value, sector: $("#bfSector").value,
    owner: $("#bfOwner").value, status: $("#bfStatus").value, value: v ? Number(v) : null, closingDate: $("#bfClosing").value,
    submittedDate: $("#bfSubmitted").value, outcomeDate: $("#bfOutcome").value, score: $("#bfScore").value,
    reason: $("#bfReasonRow").hidden ? "" : $("#bfReason").value, feedback: $("#bfFeedback").value, notes: $("#bfNotes").value };
  const btn = $("#bidSave"); btn.disabled = true; btn.textContent = "Saving...";
  try { await saveBidRemote(bid); $("#bidDialog").close(); toast("Bid saved"); }
  catch (err) { toast(errCopy(err && err.code)); }
  finally { btn.disabled = false; btn.textContent = "Save"; }
});
$("#bidDelete").addEventListener("click", async () => {
  const d = $("#bidDelete"); if (!B.editing) return;
  if (!d.dataset.confirm) { d.dataset.confirm = "1"; d.textContent = "Confirm delete"; return; }
  try { await api("/api/bids/delete", { id: B.editing.id }); B.list = B.list.filter(b => b.id !== B.editing.id); $("#bidDialog").close(); renderBids(); toast("Bid deleted"); }
  catch (err) { toast(errCopy(err && err.code)); }
});
$("#newBidBtn").addEventListener("click", () => { if (!S.token) { showGate("Sign in to use the bid tracker."); return; } openBidDialog(null); });
$("#refreshBidsBtn").addEventListener("click", () => loadBids(true));
$("#bidSearch").addEventListener("input", e => { B.q = e.target.value; renderBids(); });
$("#bidFilter").addEventListener("click", e => { const f = e.target.closest("[data-bidfilter]"); if (f) { B.filter = f.dataset.bidfilter; renderBids(); } });
$("#bidTable").addEventListener("click", e => { const b = e.target.closest("[data-bidedit]"); if (b) openBidDialog(B.list.find(x => x.id === b.dataset.bidedit)); });
$("#bidTable").addEventListener("change", async e => {
  const s = e.target.closest("[data-bidstatus]"); if (!s) return;
  const bid = B.list.find(x => x.id === s.dataset.bidstatus); if (!bid) return;
  s.disabled = true;
  try {
    const saved = await saveBidRemote({ ...bid, status: s.value });
    toast(`Marked as ${statusLabel(saved.status).toLowerCase()}`);
    if (["lost", "won"].includes(saved.status) && !saved.feedback) setTimeout(() => openBidDialog(saved), 200);
  } catch (err) { toast(errCopy(err && err.code)); renderBids(); }
});
$("#bidFoot").addEventListener("click", async e => {
  const c = e.target.closest("#clearExamples"); if (!c) return;
  if (!c.dataset.confirm) { c.dataset.confirm = "1"; c.textContent = "Confirm: remove all example bids"; return; }
  try { const j = await api("/api/bids/clear-examples", {}); B.list = B.list.filter(b => !b.example); renderBids(); toast(`Removed ${j.removed} example bids`); }
  catch (err) { toast(errCopy(err && err.code)); }
});
document.addEventListener("click", e => {
  if (!e.target.closest("#openBid") || !S.current || !S.current.bidId) return;
  showTab("bids");
  loadBids().then(() => { const b = B.list.find(x => x.id === S.current.bidId); if (b) openBidDialog(b); });
});

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
    const cd = matchingCvs(r)[0];
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
    if (!p.name) { issues.push(`${p.role}: no CV meets all the requirements`); return; }
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
    const cd = matchingCvs(r)[0]; if (!cd) return null;
    const req = arr(info.roles).find(x => norm(x.role) === norm(r.role)) || arr(info.roles).find(x => norm(r.role).includes(norm(x.role)) || norm(x.role).includes(norm(r.role)));
    return { role: r.role, name: cd.name, certifications: [...arr(req && req.certifications), ...arr(req && req.registrations)] };
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
    <section class="evcard"><div class="evhead"><b>${esc(p.role)}</b>${p.name ? `<span>${esc(p.name)}${p.match != null ? ` · ${esc(p.match)}% match` : ""}</span>` : `<span class="pill bad">No CV meets all requirements</span>`}</div>
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
  S.current = { id: "r" + Date.now(), title: $("#bidTitle").value.trim() || "Untitled proposal", rfpName: S.rfpName, createdAt: Date.now(), sourcesLabel: sourcesLabel(), docs: allDocs(),
    steps: { info: { status: "waiting" }, cv: { status: "waiting" }, work: { status: "waiting" }, evidence: { status: "waiting" } } };
  ensureExtras(S.current);
  S.ctls = []; setRunning(true); go("overview");
  if (await stepInfo()) { ensureExtras(S.current); saveRun(true); await Promise.allSettled([stepCv(), stepWork()]); await stepEvidence(); }
  else ["cv", "work", "evidence"].forEach(k => { S.current.steps[k].status = "skipped"; S.current.steps[k].note = "Skipped because the RFP could not be read."; });
  setRunning(false); saveRun(); render();
});
async function rerun(id) {
  const c = S.current; if (S.running || !c) return;
  if (!S.token) { showGate(""); return; }
  if (!c.docs) c.docs = allDocs();
  S.ctls = []; setRunning(true);
  if (!c.steps.evidence) c.steps.evidence = { status: "waiting" };
  if (id === "info" || !c.steps.info.data) { if (await stepInfo()) { ensureExtras(c); await Promise.allSettled([stepCv(), stepWork()]); await stepEvidence(); } }
  else if (id === "cv") { await stepCv(); await stepEvidence(); }
  else if (id === "work") { await stepWork(); await stepEvidence(); }
  else await stepEvidence();
  setRunning(false); saveRun(); render();
}
$("#stopBtn").addEventListener("click", () => S.ctls.forEach(c => c.abort()));

/* ---------------- saved proposals (this browser only) ---------------- */
function saveRun(quiet) {
  const c = S.current; if (!c || !c.steps.info.data) return;
  const rec = { id: c.id, title: c.title, rfpName: c.rfpName || "", createdAt: c.createdAt, sourcesLabel: c.sourcesLabel, bidId: c.bidId || "",
    structure: c.structure || null, overrides: c.overrides || {}, links: c.links || {}, used: c.used || [], dismissed: c.dismissed || [], review: c.review || null,
    steps: Object.fromEntries(STEPS.map(s => [s.id, { status: c.steps[s.id].status === "working" ? "stopped" : c.steps[s.id].status, note: c.steps[s.id].note || "", scanNote: c.steps[s.id].scanNote || "", data: c.steps[s.id].data || null }])) };
  S.runs = [rec, ...S.runs.filter(r => r.id !== rec.id)].slice(0, 20);
  const ok = store.set("bdRuns", S.runs);
  if (!quiet) toast(ok ? "Saved in this browser" : "Could not save in this browser. Export it to keep a copy.");
  if (screen === "home") renderRecent();
}

/* ---------------- export ---------------- */
function toMarkdown() {
  const c = S.current; if (!c) return "";
  const L = [`# ${c.title}: proposal pack`, "", `RFP: ${c.rfpName || "pasted text"}. Analysed ${fmtDate(c.createdAt)}. Searched: ${c.sourcesLabel || ""}.`, ""];
  const x = c.steps.info.data;
  if (x) {
    const R = readiness(c), g = gaps(c, R.rows);
    L.push("## Readiness", "", `Overall: **${R.overall}%** (${R.label}).`, "", "| Area | Score |", "|---|---|");
    [["Compliance", R.compliance], ["Team", R.team], ["Credentials", R.credentials], ["Evidence", R.evidence], ["Proposal structure", R.proposal]].forEach(([a, b]) => L.push(`| ${a} | ${b == null ? "Waiting" : b + "%"} |`));
    if (g.crit.length) { L.push("", "### Critical issues", ""); g.crit.forEach(i => L.push(`- ${i.text}`)); }
    if (g.impr.length) { L.push("", "### Recommended improvements", ""); g.impr.forEach(i => L.push(`- ${i.text}`)); }
    L.push("", "## Compliance matrix", "", "| Ref | Requirement | Section | Evidence | Status |", "|---|---|---|---|---|");
    R.rows.forEach(r => { const sec = secById(c, r.sectionId); L.push(`| ${r.ref} | ${String(r.text).replace(/\|/g, "/")} | ${sec ? secNo(c, sec) + " " + sec.title : "None"} | ${r.evid.map(f => f.label || baseName(f.path)).join("; ") || "None"} | ${ST[r.status][2]}${r.overridden ? " (set by hand)" : ""} |`); });
    L.push("", "## Proposal structure", "");
    arr(c.structure).forEach((sec, i) => {
      L.push(`- **${String(i + 1).padStart(2, "0")} ${sec.title}** (${{ done: "Done", attention: "Needs attention", todo: "Not started" }[sec.status] || "Not started"})`);
      arr(sec.subs).forEach((sub, j) => L.push(`- ${i + 1}.${j + 1} ${sub}`));
      arr(c.used).filter(u => u.section === sec.id).forEach(u => L.push(`- Evidence: ${u.label} (${u.path})`));
    });
    L.push("");
  }
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
    matchingCvs(r).forEach(cd => {
      const d = docForCandidate(cd), m = d && cvMeta(d), st = m && cvStatus(m);
      const cvCol = !st ? "Unknown" : st.key === "unknown" ? "No date" : `${fmtDay(m.updated)} (${st.label})`;
      L.push(`| ${cd.name} | ${cd.match}% | ${arr(cd.meets).join("; ")} | ${arr(cd.gaps).join("; ") || "None"} | ${cd.confidence} | ${cvCol} |`);
    });
    if (!matchingCvs(r).length) L.push("| No CV meets all the requirements | | | | | |");
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
renderTree();
if (!API) banner("The backend address is not set. Add the API_URL repository variable and redeploy (see the README).");
const tok = sess.get("bdToken"), exp = Number(sess.get("bdExp") || 0);
$("#email").value = store.get("bdLastEmail", "") || "";
if (tok && exp > Date.now()) { S.token = tok; $("#gate").hidden = true; } else showGate("");
renderHello();
renderSources();
const startAt = String(location.hash || "").slice(1);
go(SCREENS.includes(startAt) && !PROPOSAL.has(startAt) ? startAt : "home");
})();
