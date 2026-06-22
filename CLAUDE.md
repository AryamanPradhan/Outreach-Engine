Context for Claude Code working in this repo. Keep this file lean — full implementation spec lives in docs/SPEC.md, read it when working on architecture or a new module.

Project

Auto Outreach — daily automation that reads leads from a Google Sheet, scrapes each lead's company LinkedIn page for context, generates a personalized cold email with Claude, and sends it.


Runtime: Node.js + TypeScript
Deployment: Trigger.dev (scheduled cron job)
Data source: Google Sheets API
Scraping: ScraperAPI (free tier)
Email generation: Open AI API 
Email sending: Nodemailer (SMTP) or SendGrid


Full architecture, data flow, and rationale: see docs/SPEC.md.

Project Structure

src/
  trigger/
    outreach.ts       # Main Trigger.dev scheduled job — orchestrates the daily run
  lib/
    sheets.ts          # Google Sheets read/write
    linkedin.ts         # LinkedIn URL resolution (Google CSE) + scraping (ScraperAPI)
    email-gen.ts         # Claude prompt + email generation
    mailer.ts             # Email sending
trigger.config.ts
docs/
  SPEC.md              # Full design doc — read before adding new modules

Commands

bashnpm install                       # install deps
npx trigger.dev@latest dev        # local dev run with live logs
npx trigger.dev@latest deploy     # deploy to Trigger.dev
npx tsc --noEmit                  # typecheck

There is no test suite yet. If you add one, use vitest and put tests next to the file they cover (*.test.ts).

Environment Variables

All required vars are listed in .env.example. Never hardcode credentials, read from process.env. Full list and where each is used: docs/SPEC.md#environment-variables.

Conventions


One try/catch per lead in the main loop (outreach.ts) — a single failed lead must never abort the batch. Always log the error to the sheet's error_log column and move on.
Throttle between leads — keep the setTimeout delay between iterations; don't remove it even for testing (ScraperAPI / Google CSE rate limits).
Selectors in linkedin.ts are fragile — LinkedIn changes its markup periodically. If scraping starts returning empty descriptions, check the cheerio selectors first before assuming the API key is wrong.
Email template placeholders (VALUE_PROPOSITION, CALL_TO_ACTION, SIGN_OFF) live at the top of email-gen.ts as constants — edit those directly, don't restructure the prompt around them without checking docs/SPEC.md for the intended template format.
Claude's email output must be parsed as JSON ({subject, body}). If you change the prompt, keep the "return ONLY valid JSON" instruction or downstream parsing breaks.
Sheet column order is fixed:firstName  lastName	fullName	title	position	seniority	email	emailStatus	phone	linkedinUrl	personCountry	companyName	companyDomain	companyCountry	companyDescription	companyLinkedinUrl	companySize	companySizeRange	annualRevenue	Reachout	

Safety Rails


MAX_EMAILS_PER_RUN env var caps how many leads get processed per run — never bypass this when testing against the real sheet.
When testing, point contact_email at your own address or stub out sendEmail() — don't send real cold emails during development.


Where to Look for Detail


Full architecture diagram, rationale for ScraperAPI/Google CSE choice, rate limit table → docs/SPEC.md
Deployment steps for Trigger.dev → docs/SPEC.md#deployment--triggerdev
Testing protocol before going live → docs/SPEC.md#testing-protocol