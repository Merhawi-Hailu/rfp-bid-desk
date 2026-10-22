// Bid tracker storage, kept in Cloudflare Workers KV (binding "BIDS").
// One key per bid: "bid:<id>". Shared by everyone who signs in.
// Holds bid details only (client, dates, status, value, feedback). No CV or tender text.

export const STATUSES = ["in_progress", "submitted", "won", "lost", "withdrawn", "no_bid"];
export const REASONS = [
  "Price",
  "Functionality score below threshold",
  "Mandatory requirement not met",
  "B-BBEE / specific goals points",
  "Experience or references",
  "Key personnel",
  "Late or incomplete submission",
  "Project cancelled by client",
  "Other",
];
const MAX_BIDS = 500;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const date = v => (typeof v === "string" && DATE.test(v) ? v : "");
const num = v => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(/[^0-9.]/g, "")) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 1e12 ? Math.round(n) : null;
};
const today = () => new Date().toISOString().slice(0, 10);

/** Cleans a bid sent by the browser. Unknown fields are dropped. */
export function cleanBid(input, existing) {
  if (!input || typeof input !== "object") throw Object.assign(new Error("bad_bid"), { code: "bad_request" });
  const status = STATUSES.includes(input.status) ? input.status : existing ? existing.status : "in_progress";
  const title = str(input.title, 200);
  if (!title) throw Object.assign(new Error("title_required"), { code: "bad_request" });
  const now = new Date().toISOString();
  const bid = {
    id: existing ? existing.id : /^[a-z0-9-]{6,40}$/.test(input.id || "") ? input.id : crypto.randomUUID(),
    title,
    client: str(input.client, 200),
    reference: str(input.reference, 100),
    sector: str(input.sector, 100),
    owner: str(input.owner, 100),
    closingDate: date(input.closingDate),
    submittedDate: date(input.submittedDate),
    outcomeDate: date(input.outcomeDate),
    status,
    value: num(input.value),
    reason: REASONS.includes(input.reason) ? input.reason : "",
    feedback: str(input.feedback, 2000),
    score: str(input.score, 100),
    notes: str(input.notes, 2000),
    analysisId: str(input.analysisId, 40),
    example: existing ? Boolean(existing.example) : false,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
    history: existing && Array.isArray(existing.history) ? existing.history.slice(-29) : [],
  };
  if (["submitted", "won", "lost"].includes(status) && !bid.submittedDate) bid.submittedDate = today();
  if (["won", "lost", "withdrawn", "no_bid"].includes(status) && !bid.outcomeDate) bid.outcomeDate = today();
  if (!existing || existing.status !== status) bid.history.push({ status, at: now });
  return bid;
}

export async function listBids(kv) {
  await seedOnce(kv);
  const ids = await listKeys(kv);
  const bids = await Promise.all(ids.slice(0, MAX_BIDS).map(k => kv.get(k, "json")));
  return bids.filter(Boolean);
}

export async function saveBid(kv, input) {
  const id = input && typeof input.id === "string" ? input.id : "";
  const existing = id ? await kv.get("bid:" + id, "json") : null;
  if (!existing && (await listKeys(kv)).length >= MAX_BIDS) throw Object.assign(new Error("tracker_full"), { code: "tracker_full" });
  const bid = cleanBid(input, existing);
  await kv.put("bid:" + bid.id, JSON.stringify(bid));
  return bid;
}

export async function deleteBid(kv, id) {
  if (typeof id !== "string" || !/^[a-z0-9-]{6,40}$/.test(id)) throw Object.assign(new Error("bad_id"), { code: "bad_request" });
  await kv.delete("bid:" + id);
}

export async function clearExamples(kv) {
  const bids = await listBids(kv);
  const ex = bids.filter(b => b.example);
  await Promise.all(ex.map(b => kv.delete("bid:" + b.id)));
  return ex.length;
}

async function listKeys(kv) {
  const out = [];
  let cursor;
  for (let i = 0; i < 5; i++) {
    const page = await kv.list({ prefix: "bid:", limit: 1000, cursor });
    page.keys.forEach(k => out.push(k.name));
    if (page.list_complete || !page.cursor) break;
    cursor = page.cursor;
  }
  return out;
}

/** Adds the fictional example bids the first time the tracker is opened. */
async function seedOnce(kv) {
  if (await kv.get("meta:seeded")) return;
  const now = new Date().toISOString();
  await Promise.all(EXAMPLES.map((e, i) => {
    const id = "example-" + String(i + 1).padStart(2, "0");
    const bid = { id, client: "", reference: "", sector: "", owner: "", closingDate: "", submittedDate: "", outcomeDate: "", value: null, reason: "", feedback: "", score: "", notes: "", analysisId: "", ...e, example: true, createdAt: now, updatedAt: now, history: [{ status: e.status, at: now }] };
    return kv.put("bid:" + id, JSON.stringify(bid));
  }));
  await kv.put("meta:seeded", now);
}

// Fictional examples. Every client, value and comment is made up.
export const EXAMPLES = [
  { title: "Data analytics and reporting platform", client: "Northvale Metropolitan Municipality", reference: "NMM/ICT/2026/014", sector: "Local government", owner: "Bid team", closingDate: "2026-11-27", status: "in_progress", value: 3200000 },
  { title: "AI demand forecasting for water supply", client: "Highveld Water Board (example)", reference: "HWB-2026-031", sector: "Utilities", owner: "Bid team", closingDate: "2026-09-30", submittedDate: "2026-09-29", status: "submitted", value: 2100000 },
  { title: "Billing data quality and POPIA governance", client: "Kwena Local Municipality", reference: "KLM/2024/088", sector: "Local government", closingDate: "2024-11-20", submittedDate: "2024-11-19", outcomeDate: "2025-01-10", status: "won", value: 1600000, score: "84 / 100", feedback: "Strong governance approach and a clear POPIA plan." },
  { title: "Electricity revenue dashboards on Microsoft Fabric", client: "Mopane City Council", reference: "MCC-ICT-2024-12", sector: "Local government", closingDate: "2024-06-14", submittedDate: "2024-06-13", outcomeDate: "2024-07-30", status: "won", value: 2300000, score: "88 / 100", feedback: "Relevant Fabric experience and a strong team." },
  { title: "Power BI skills programme", client: "Provincial Department of Health (example)", reference: "PDOH-2024-007", sector: "Health", closingDate: "2024-02-09", submittedDate: "2024-02-08", outcomeDate: "2024-03-15", status: "won", value: 900000, feedback: "Best training and skills transfer plan." },
  { title: "Smart water meter analytics", client: "Riverbend District Municipality (example)", reference: "RDM-2025-019", sector: "Local government", closingDate: "2025-05-16", submittedDate: "2025-05-15", outcomeDate: "2025-07-02", status: "lost", value: 2750000, reason: "Price", score: "79 / 100", feedback: "Our price was about 18% above the preferred bidder." },
  { title: "Enterprise data lake", client: "Coastal Ports Authority (example)", reference: "CPA-DL-2025-04", sector: "Transport", closingDate: "2025-08-22", submittedDate: "2025-08-21", outcomeDate: "2025-10-03", status: "lost", value: 5400000, reason: "Functionality score below threshold", score: "66 / 100 (70 needed)", feedback: "Methodology lacked detail on data migration and testing." },
  { title: "Learner performance analytics", client: "Eastvale Provincial Education (example)", reference: "EPE-2025-112", sector: "Education", closingDate: "2025-11-07", submittedDate: "2025-11-06", outcomeDate: "2025-11-28", status: "lost", value: 1800000, reason: "Mandatory requirement not met", feedback: "Disqualified: SBD 6.1 form was not included." },
  { title: "Asset data platform", client: "Northern Roads Agency (example)", reference: "NRA-2026-003", sector: "Transport", closingDate: "2026-03-13", submittedDate: "2026-03-12", outcomeDate: "2026-05-20", status: "lost", value: 2600000, reason: "B-BBEE / specific goals points", score: "Price and goals: 88 / 100", feedback: "Lost on specific goals points, 18 of 20 against the winner's 20." },
  { title: "Fare collection analytics", client: "Metro Transport Authority (example)", reference: "MTA-2026-021", sector: "Transport", closingDate: "2026-07-10", status: "no_bid", outcomeDate: "2026-06-30", reason: "Key personnel", notes: "Decided not to bid: the tender asked for a lead with 10+ years in fare systems." },
];
