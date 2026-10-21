# RFP Bid Desk

A demo web app for bid teams. You load a tender (RFP, RFQ or RFI) and it:

1. **Extracts the key information**: client, closing date, mandatory items, scoring, the roles asked for, and any previous work the client wants to see.
2. **Matches CVs to roles**: ranks consultants for each role with a match score, what they meet, and their gaps.
3. **Finds supporting past work**: scans a folder of project reports and reference letters and shows which ones prove each experience requirement.

It ships with a **fictional demo repository** (6 CVs, 8 projects, 3 reference letters) and a sample tender, so it can be shown without any real company data.

Live site: https://merhawi-hailu.github.io/rfp-bid-desk/

## How it is built

```
Browser (GitHub Pages)  ──password login──▶  Cloudflare Worker  ──▶  Cloudflare Workers AI (free)
   web/                                         worker/              or Claude API (optional, paid)
```

- **web/** is a static site served by GitHub Pages. It holds no secrets.
- **worker/** is the backend. It checks the demo password, builds the prompts, and calls the AI model.
- By default the AI is **Cloudflare Workers AI** (Llama 4 Scout). It is free within a daily allowance and **needs no API key**.

See [SECURITY.md](SECURITY.md) for the security controls.

## Setup (about 15 minutes, one time)

You need a GitHub account and a free Cloudflare account. No AI API key is needed.

### 1. Deploy the backend to Cloudflare

On a laptop where you can install software, with Node.js 20 or newer:

```bash
git clone https://github.com/Merhawi-Hailu/rfp-bid-desk.git
cd rfp-bid-desk/worker
npm install
npx wrangler login                     # opens the browser to sign in to Cloudflare
npx wrangler secret put DEMO_PASSWORD  # choose the password you will give stakeholders
npx wrangler secret put SESSION_SECRET # paste a long random string (see below)
npx wrangler deploy
```

To make a good `SESSION_SECRET`, run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and paste the result.

`wrangler deploy` prints the backend address, for example `https://rfp-bid-desk-api.<your-name>.workers.dev`. Copy it.

Check it works: open `<backend address>/api/health`. You should see `"configured": true`.

### 2. Point the web app at the backend

In GitHub: **Settings → Secrets and variables → Actions → Variables → New repository variable**

- Name: `API_URL`
- Value: the backend address from step 1 (no slash at the end)

Then go to **Actions → Deploy web app to GitHub Pages → Run workflow**.

### 3. Try it

Open the live site, sign in with the demo password, click **Load the sample tender**, then **Analyse tender**.

### Optional: deploy the backend automatically

To redeploy the backend on every push, add these repository **secrets**:

- `CLOUDFLARE_API_TOKEN`: create one in Cloudflare with the "Edit Cloudflare Workers" template, and add the "Workers AI: Read" permission
- `CLOUDFLARE_ACCOUNT_ID`: shown on the Cloudflare dashboard

Without them, the workflow still runs the tests and skips the deploy.

## The free AI allowance

- Cloudflare's free plan gives **10,000 neurons per day**. It resets at 00:00 UTC (02:00 South African time).
- One demo run with the sample tender uses roughly 1,000 neurons, so expect about **10 runs a day**. Long real tenders use more.
- When the allowance runs out, the app says so and asks you to try again after the reset.

## Switching to Claude later

If you get a Claude API key later, and your company allows it:

1. `npx wrangler secret put ANTHROPIC_API_KEY`
2. In `worker/wrangler.toml`, set `AI_PROVIDER = "anthropic"`
3. `npx wrangler deploy`

No other code changes are needed.

## Changing settings later

| What | Where |
|---|---|
| Demo password | `npx wrangler secret put DEMO_PASSWORD` |
| Sign everyone out now | `npx wrangler secret put SESSION_SECRET` with a new value |
| AI model | `WORKERS_AI_MODEL` or `CLAUDE_MODEL` in `worker/wrangler.toml` |
| Login length | `SESSION_HOURS` in `worker/wrangler.toml` (1 to 24) |
| Rate limits | `[[ratelimits]]` in `worker/wrangler.toml` |

## Running the tests

```bash
cd worker && npm test
```

## Limits of this demo

- Saved analyses are kept in each person's browser, not on a server.
- Folders opened from a laptop are read in the browser. Only the text needed for an analysis is sent to the backend, and the backend does not store it.
- Scanned PDFs without a text layer cannot be read.
- The free model is less accurate than Claude on long or messy tenders. If a step comes back in the wrong shape, run it again.
- Use fictional or approved data only. Do not load confidential client documents into a demo.
