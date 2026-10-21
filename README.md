# RFP Bid Desk

A demo web app for bid teams. You load a tender (RFP, RFQ or RFI) and it:

1. **Extracts the key information**: client, closing date, mandatory items, scoring, the roles asked for, and any previous work the client wants to see.
2. **Matches CVs to roles**: ranks consultants for each role with a match score, what they meet, and their gaps.
3. **Finds supporting past work**: scans a folder of project reports and reference letters and shows which ones prove each experience requirement.
4. **Builds the evidence pack**: links the right CV, certificates and proof of similar work to each requirement, checks certificate expiry dates against the closing date, and lists what to fix before submitting.
5. **Checks CV certifications against the certificates on file**: lists each certification a CV claims, finds the matching certificate file, and flags missing proof, expired certificates, and certificates on file that the CV does not mention. One click drafts an email asking the person for the missing copies.
6. **Checks CVs are up to date**: flags CVs not updated in the last 12 months (you can change this) and opens a ready-written reminder email to the CV owner. Out-of-date CVs are also flagged in the skills match.

It ships with a **fictional demo repository** (6 CVs, 8 projects, 3 reference letters, 7 certificates and compliance documents) and a sample tender, so it can be shown without any real company data.

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

## Setup (about 15 minutes, one time, all in the browser)

You need a GitHub account and a free Cloudflare account. No AI API key and no software install is needed. GitHub deploys the backend for you.

### 1. In Cloudflare

1. Open **Workers & Pages** once, so Cloudflare creates your free `workers.dev` address.
2. Copy your **Account ID** (shown on the Workers & Pages overview, or in the account home page).
3. Go to **My Profile → API Tokens → Create Token**, use the **Edit Cloudflare Workers** template, and also add the permission **Account · Workers AI · Read**. Create it and copy the token. It is shown only once.

### 2. In GitHub: add three repository secrets

**Settings → Secrets and variables → Actions → Secrets → New repository secret**

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | the token from step 1.3 |
| `CLOUDFLARE_ACCOUNT_ID` | the Account ID from step 1.2 |
| `DEMO_PASSWORD` | the password you will give stakeholders |

A session signing key is made automatically on every deploy, so there is nothing else to set.

### 3. Deploy the backend

**Actions → Test and deploy backend (Cloudflare Worker) → Run workflow**. When it finishes, its summary shows the backend address, for example `https://rfp-bid-desk-api.<your-name>.workers.dev`.

Check it: open `<backend address>/api/health`. You should see `"configured": true`.

### 4. Point the web app at the backend

**Settings → Secrets and variables → Actions → Variables → New repository variable**: name `API_URL`, value the backend address (no slash at the end).

Then **Actions → Deploy web app to GitHub Pages → Run workflow**.

### 5. Try it

Open the live site, sign in with the demo password, click **Load the sample tender**, then **Analyse tender**.

### Deploying from a laptop instead

If you prefer the command line (Node.js 20 or newer):

```bash
cd worker && npm install
npx wrangler login
npx wrangler secret put DEMO_PASSWORD
npx wrangler secret put SESSION_SECRET   # a long random string
npx wrangler deploy
```

## The free AI allowance

- Cloudflare's free plan gives **10,000 neurons per day**. It resets at 00:00 UTC (02:00 South African time).
- One demo run with the sample tender uses roughly 1,000 neurons, so expect about **10 runs a day**. Long real tenders use more.
- When the allowance runs out, the app says so and asks you to try again after the reset.

## Switching to Claude later

If you get a Claude API key later, and your company allows it:

1. Add the key as a Worker secret named `ANTHROPIC_API_KEY` (Cloudflare dashboard → your Worker → Settings → Variables and Secrets)
2. In `worker/wrangler.toml`, set `AI_PROVIDER = "anthropic"` and push

No other code changes are needed.

## Changing settings later

| What | Where |
|---|---|
| Demo password | Change the `DEMO_PASSWORD` repository secret, then rerun the backend workflow |
| Sign everyone out now | Rerun the backend workflow (it makes a new signing key) |
| AI model | `WORKERS_AI_MODEL` or `CLAUDE_MODEL` in `worker/wrangler.toml` |
| Login length | `SESSION_HOURS` in `worker/wrangler.toml` (1 to 24) |
| Rate limits | `[[ratelimits]]` in `worker/wrangler.toml` |

## Running the tests

```bash
cd worker && npm test
```

## CV check

- The last-updated date is read from the CV text, for example `CV last updated: 14 June 2025`. Formats like `2025-06-14`, `14/06/2025` and `June 2025` also work. If no date is written, the file's saved date is used.
- The owner's email is the first email address in the CV. You can type a different date or email in any row.
- **Email reminder** opens a draft in your own email app (for example Outlook). Nothing is sent until you press Send.
- Status rules: **Overdue** at or past the limit, **Due soon** in the last 2 months before it, **Current** otherwise.
- Settings, typed dates and emails, and the reminder log are kept in your browser.

## Folder layout

The app works best with **one folder per person**, holding their CV and their certificates:

```
Consultants/
  Merhawi Hailu/
    Merhawi Hailu CV.pdf
    DP-700 certificate.pdf
    certs/AZ-900.pdf
  Thandi Mokoena/
    ...
Past Projects/
Reference Letters/
Company Compliance/
```

A folder that holds exactly one CV is treated as that person's folder. Every other file in it, including subfolders, counts as their certificate, whatever the file is called. The folder name is used as the person's name. Shared folders (for example one "CVs" folder for everyone) also work: certificates are then matched by the holder's name in the file.

## Cert check

- **Quick check** (instant, no AI): reads the CV's "Certifications" section, finds the matching certificate file by person and certification code (for PRINCE2 and similar, the level must match), and checks expiry dates. Course attendance certificates are flagged for checking.
- **Check with AI**: the AI reads each person's CV and every file in their folder. It confirms each listed certification has a real certificate, and catches attendance certificates, wrong levels and name mismatches. It also lists certificates on file that the CV does not mention. Results are kept in your browser until the files change.
- **Link a file** connects a certificate by hand when the match is missed. **Request missing certificates** drafts an email to the person.

## Limits of this demo

- Saved analyses are kept in each person's browser, not on a server.
- Folders opened from a laptop are read in the browser. Only the text needed for an analysis is sent to the backend, and the backend does not store it.
- Scanned PDFs without a text layer cannot be read.
- The free model is less accurate than Claude on long or messy tenders. If a step comes back in the wrong shape, run it again.
- Use fictional or approved data only. Do not load confidential client documents into a demo.
