# RFP Bid Desk

A demo web app for bid teams. You load a tender (RFP, RFQ or RFI) and it:

1. **Extracts the key information**: client, closing date, mandatory items, scoring, the roles asked for, and any previous work the client wants to see.
2. **Matches CVs to roles**: ranks consultants for each role with a match score, what they meet, and their gaps.
3. **Finds supporting past work**: scans a folder of project reports and reference letters and shows which ones prove each experience requirement.

It ships with a **fictional demo repository** (6 CVs, 8 projects, 3 reference letters) and a sample tender, so it can be shown without any real company data.

## How it is built

```
Browser (GitHub Pages)  ──password login──▶  Cloudflare Worker  ──API key (secret)──▶  Claude API
   web/                                         worker/
```

- **web/** is a static site served by GitHub Pages. It holds no secrets.
- **worker/** is the backend. It checks the demo password, holds the Claude API key as a Cloudflare secret, builds the prompts, and calls Claude.

See [SECURITY.md](SECURITY.md) for the security controls.

## Setup (about 20 minutes, one time)

You need: a GitHub account, a free Cloudflare account, and a Claude API key from [console.anthropic.com](https://console.anthropic.com) with billing set up.

### 1. Deploy the backend to Cloudflare

On your laptop, with Node.js 20 or newer:

```bash
git clone https://github.com/Hailu187/rfp-bid-desk.git
cd rfp-bid-desk/worker
npm install
npx wrangler login            # opens the browser to sign in to Cloudflare
npx wrangler secret put ANTHROPIC_API_KEY   # paste your Claude API key
npx wrangler secret put DEMO_PASSWORD       # choose the password you will give stakeholders
npx wrangler secret put SESSION_SECRET      # paste a long random string (see below)
npx wrangler deploy
```

To make a good `SESSION_SECRET`, run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and paste the result.

`wrangler deploy` prints the backend address, for example `https://rfp-bid-desk-api.<your-name>.workers.dev`. Copy it.

Check it works: open `<backend address>/api/health`. You should see `"configured": true`.

### 2. Point the web app at the backend

In GitHub: **Settings → Secrets and variables → Actions → Variables → New repository variable**

- Name: `API_URL`
- Value: the backend address from step 1 (no slash at the end)

### 3. Turn on GitHub Pages

In GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Then go to **Actions → Deploy web app to GitHub Pages → Run workflow**. When it finishes, the site is at `https://hailu187.github.io/rfp-bid-desk/`.

> GitHub Pages from a **private** repository needs a paid GitHub plan (Pro, Team or Enterprise). On the free plan, either upgrade or make the repository public. Making it public is safe from a secrets point of view, because no secrets are stored in the code, but the code and fictional demo data become visible.

### 4. Check the allowed web address

`worker/wrangler.toml` sets `ALLOWED_ORIGINS = "https://hailu187.github.io"`. The backend refuses calls from any other website. If you use a custom domain, add it there (comma separated) and redeploy the backend.

### 5. Optional: deploy the backend automatically

To redeploy the backend on every push, add these repository **secrets**:

- `CLOUDFLARE_API_TOKEN`: create one in Cloudflare with the "Edit Cloudflare Workers" template
- `CLOUDFLARE_ACCOUNT_ID`: shown on the Cloudflare dashboard

Without them, the workflow still runs the tests and skips the deploy.

## Changing settings later

| What | Where |
|---|---|
| Demo password | `npx wrangler secret put DEMO_PASSWORD` (old logins stop working after `SESSION_SECRET` changes or tokens expire) |
| Sign everyone out now | `npx wrangler secret put SESSION_SECRET` with a new value |
| Claude model | `MODEL` in `worker/wrangler.toml` |
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
- Use fictional or approved data only. Do not load confidential client documents into a demo.
