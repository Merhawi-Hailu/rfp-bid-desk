# Security

This is a stakeholder demo. These controls are in place.

## Secrets

- The demo password and the token signing key are stored as **Cloudflare Worker secrets**. They are never in the code, the repository or the browser.
- The default AI (Cloudflare Workers AI) is reached through a Cloudflare binding, so **no AI API key exists** that could leak. If Claude is turned on later, its API key is also stored only as a Cloudflare secret.
- `.gitignore` blocks local secret files (`.env`, `.dev.vars`).

## Access

- **Password login.** The backend checks the demo password using a constant time comparison, so timing cannot reveal it.
- **Signed sessions.** A correct password returns a token signed with HMAC SHA-256. It expires after `SESSION_HOURS` (8 by default). A new signing key is made on every backend deploy, so redeploying signs everyone out.
- The token is kept in the browser's session storage, so it is cleared when the tab closes.

## Abuse protection

- **Origin lock.** The backend only answers requests from the web addresses in `ALLOWED_ORIGINS`.
- **Rate limits.** 5 login attempts per minute per IP address, and 10 analysis calls per minute per session.
- **Fixed tasks only.** The browser cannot send its own prompt. It sends data for one of four tasks (`extract`, `cv`, `work`, `evidence`) and the backend builds the prompt. The backend cannot be used as a general chatbot.
- **Size limits.** Requests over 600 KB are refused. Prompts are capped at 120 KB (free AI) or 250 KB (Claude) and outputs at a fixed number of tokens.
- **Prompt injection guard.** Tender and document text is wrapped and the model is told to treat it as data, not instructions.
- **Spend limit.** On Cloudflare's free plan, Workers AI stops at the daily free allowance, so it cannot run up a bill. If Claude is turned on later, set a monthly spend limit in the Claude Console.

## Web app

- Strict **Content Security Policy**: scripts only from the site itself, network calls only to `*.workers.dev`, no inline scripts, no forms posting elsewhere.
- Third party libraries (pdf.js, mammoth, DOMPurify) are **copied into `web/vendor/`** instead of loaded from a CDN, and pinned to fixed versions.
- All model output is escaped and passed through DOMPurify before it is shown.
- `noindex` and `no-referrer` are set, so search engines do not list the page and the URL is not leaked to other sites.

## Data

- The backend does not store tender or CV content and does not log it. Only short error reasons are logged.
- Text sent for analysis is processed by the AI provider (Cloudflare Workers AI by default). Review that provider's terms before using any real data.
- Use fictional or approved data in the demo.

## Before using real company data

This demo is not approved for confidential documents. Before real use, add at least: company single sign on (for example Microsoft Entra ID) instead of a shared password, a data processing review of the AI provider under your company's policy, and hosting in an approved environment.

## Reporting a problem

Contact the repository owner directly. Do not open a public issue for security problems.
