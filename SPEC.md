# Auto Outreach — Full Spec

> This is the detailed design reference. For day-to-day Claude Code context (commands, structure, conventions), see `CLAUDE.md` in the project root.

## Project Overview

Daily automated outreach system that reads leads from a Google Sheet, enriches each lead with LinkedIn company data via ScraperAPI, generates a personalized cold email using Claude AI, and sends it — deployed and scheduled on Trigger.dev.

**Platform:** Trigger.dev (cloud)
**Language:** TypeScript
**Trigger:** Cron schedule — runs daily
**Data source:** Google Sheets API
**Scraper:** ScraperAPI (free tier: 5,000 calls/month)

---

## Architecture

```
Trigger.dev Cron Job (daily)
  → Google Sheets API — fetch unprocessed leads
  → for...of loop over leads (sequential, rate-limit safe):
      → Google Custom Search API — resolve LinkedIn company URL (if missing)
      → ScraperAPI — scrape LinkedIn About section
      → Parse HTML — extract company description, industry, specialties
      → Anthropic API (Claude) — generate personalized email
      → Nodemailer / SendGrid SDK — send email
      → Google Sheets API — update row status + timestamp
  → catch block — log errors per lead, never crash the full run
```

---

## Project Structure

```
auto-outreach/
├── src/
│   └── trigger/
│       └── outreach.ts          # Main Trigger.dev job
├── src/
│   └── lib/
│       ├── sheets.ts            # Google Sheets read/write helpers
│       ├── linkedin.ts          # LinkedIn URL resolution + ScraperAPI scrape
│       ├── email-gen.ts         # Claude AI email generation
│       └── mailer.ts            # Email sending (Nodemailer/SendGrid)
├── .env                         # Local env vars
├── trigger.config.ts            # Trigger.dev project config
└── package.json
```

---

## Dependencies

```bash
npm install \
  @trigger.dev/sdk \
  @trigger.dev/react \
  googleapis \
  axios \
  cheerio \
  @anthropic-ai/sdk \
  nodemailer \
  # OR: @sendgrid/mail (instead of nodemailer for better deliverability)
  dotenv
```

```bash
npm install -D typescript @types/node @types/nodemailer @types/cheerio tsx
```

---

## Environment Variables

```env
# Google Sheets
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEET_ID=your_google_sheet_id_here

# ScraperAPI
SCRAPER_API_KEY=your_scraperapi_key_here

# Google Custom Search (for LinkedIn URL resolution)
GOOGLE_CSE_API_KEY=your_google_api_key_here
GOOGLE_CSE_ID=your_custom_search_engine_id_here

# Anthropic
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Email (choose one)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your_app_password
# OR
SENDGRID_API_KEY=your_sendgrid_key_here

# Safety
MAX_EMAILS_PER_RUN=50
```

Set all of these in Trigger.dev dashboard under **Environment Variables** for production.

---

## Step-by-Step Implementation

### 1. Trigger.dev Job — `src/trigger/outreach.ts`

```typescript
import { schedules } from "@trigger.dev/sdk/v3";
import { fetchPendingLeads, updateLeadStatus } from "../lib/sheets";
import { resolveLinkedInUrl, scrapeLinkedInAbout } from "../lib/linkedin";
import { generateEmail } from "../lib/email-gen";
import { sendEmail } from "../lib/mailer";

export const autoOutreachJob = schedules.task({
  id: "auto-outreach-daily",
  // Runs every day at 9:00 AM IST (UTC+5:30 = 03:30 UTC)
  cron: "30 3 * * *",
  maxDuration: 300, // 5 min timeout
  run: async () => {
    const leads = await fetchPendingLeads();
    console.log(`Found ${leads.length} pending leads`);

    const MAX = parseInt(process.env.MAX_EMAILS_PER_RUN || "50");
    const batch = leads.slice(0, MAX);

    for (const lead of batch) {
      try {
        // Step 1: Resolve LinkedIn URL if missing
        const linkedinUrl =
          lead.linkedin_url ||
          (await resolveLinkedInUrl(lead.company_name, lead.company_domain));

        // Step 2: Scrape LinkedIn About section
        const companyData = await scrapeLinkedInAbout(linkedinUrl);

        // Step 3: Generate personalized email
        const email = await generateEmail({
          contactName: lead.contact_name,
          companyName: lead.company_name,
          aboutText: companyData.description,
          industry: companyData.industry,
          specialties: companyData.specialties,
        });

        // Step 4: Send email
        await sendEmail({
          to: lead.contact_email,
          subject: email.subject,
          body: email.body,
        });

        // Step 5: Update sheet row
        await updateLeadStatus(lead.rowIndex, {
          status: "sent",
          email_sent_date: new Date().toISOString(),
          linkedin_url: linkedinUrl,
        });

        console.log(`✅ Sent to ${lead.contact_email}`);

        // Throttle — 2 second delay between leads
        await new Promise((res) => setTimeout(res, 2000));
      } catch (err: any) {
        console.error(`❌ Failed for ${lead.contact_email}: ${err.message}`);
        await updateLeadStatus(lead.rowIndex, {
          status: "error",
          error_log: err.message,
        });
        // Continue to next lead — never abort the full run
      }
    }
  },
});
```

---

### 2. Google Sheets Helper — `src/lib/sheets.ts`

```typescript
import { google } from "googleapis";

const auth = new google.auth.JWT(
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  undefined,
  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  ["https://www.googleapis.com/auth/spreadsheets"]
);

const sheets = google.sheets({ version: "v4", auth });
const SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const TAB = "Leads"; // Name of your sheet tab

export interface Lead {
  rowIndex: number;
  company_name: string;
  contact_name: string;
  contact_email: string;
  company_domain: string;
  linkedin_url: string;
  status: string;
}

export async function fetchPendingLeads(): Promise<Lead[]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!A2:H`, // Skip header row
  });

  const rows = res.data.values || [];
  return rows
    .map((row, i) => ({
      rowIndex: i + 2, // 1-indexed + header offset
      company_name: row[0] || "",
      contact_name: row[1] || "",
      contact_email: row[2] || "",
      company_domain: row[3] || "",
      linkedin_url: row[4] || "",
      status: row[5] || "",
      email_sent_date: row[6] || "",
      error_log: row[7] || "",
    }))
    .filter((lead) => !lead.status || lead.status === "pending");
}

export async function updateLeadStatus(
  rowIndex: number,
  data: {
    status?: string;
    email_sent_date?: string;
    linkedin_url?: string;
    error_log?: string;
  }
) {
  // Columns: A=company_name B=contact_name C=contact_email D=company_domain
  //          E=linkedin_url F=status G=email_sent_date H=error_log
  const updates: { range: string; values: string[][] }[] = [];

  if (data.linkedin_url)
    updates.push({ range: `${TAB}!E${rowIndex}`, values: [[data.linkedin_url]] });
  if (data.status)
    updates.push({ range: `${TAB}!F${rowIndex}`, values: [[data.status]] });
  if (data.email_sent_date)
    updates.push({ range: `${TAB}!G${rowIndex}`, values: [[data.email_sent_date]] });
  if (data.error_log)
    updates.push({ range: `${TAB}!H${rowIndex}`, values: [[data.error_log]] });

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: "RAW",
      data: updates,
    },
  });
}
```

---

### 3. LinkedIn Scraper — `src/lib/linkedin.ts`

```typescript
import axios from "axios";
import * as cheerio from "cheerio";

const SCRAPER_KEY = process.env.SCRAPER_API_KEY!;
const CSE_KEY = process.env.GOOGLE_CSE_API_KEY!;
const CSE_ID = process.env.GOOGLE_CSE_ID!;

// Step 1: Find the LinkedIn URL via Google Custom Search
export async function resolveLinkedInUrl(
  companyName: string,
  domain: string
): Promise<string> {
  const query = `site:linkedin.com/company/ "${companyName}"`;
  const url = `https://www.googleapis.com/customsearch/v1?key=${CSE_KEY}&cx=${CSE_ID}&q=${encodeURIComponent(query)}&num=1`;

  const res = await axios.get(url);
  const items = res.data.items || [];
  if (!items.length) throw new Error(`LinkedIn URL not found for ${companyName}`);

  return items[0].link as string;
}

// Step 2: Scrape the LinkedIn company page via ScraperAPI
export async function scrapeLinkedInAbout(linkedinUrl: string): Promise<{
  description: string;
  industry: string;
  specialties: string;
}> {
  const scraperUrl = `http://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(
    linkedinUrl
  )}&render=true`; // render=true enables JS rendering (costs 5 credits/call on free plan)

  const res = await axios.get(scraperUrl, { timeout: 30000 });
  const $ = cheerio.load(res.data);

  // LinkedIn's public page selectors (may need updating if LinkedIn changes markup)
  const description =
    $('p[data-test-id="about-us__description"]').text().trim() ||
    $(".org-about-us-organization-description__text").text().trim() ||
    $('section[data-test-id="about-us"] p').first().text().trim() ||
    "No description found";

  const industry =
    $('dd[data-test-id="about-us__industry"]').text().trim() ||
    $(".org-about-company-module__industry").text().trim() ||
    "";

  const specialties =
    $('dd[data-test-id="about-us__specialties"]').text().trim() ||
    $(".org-about-company-module__specialties").text().trim() ||
    "";

  return { description, industry, specialties };
}
```

> **Note on ScraperAPI credits:** `render=true` costs 5 credits per call (handles JavaScript-rendered pages). With 5,000 free credits/month, that's 1,000 scrapes/month (~33/day). For pure HTML pages, omit `render=true` to use 1 credit per call.

---

### 4. Email Generator — `src/lib/email-gen.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface EmailInput {
  contactName: string;
  companyName: string;
  aboutText: string;
  industry: string;
  specialties: string;
}

interface EmailOutput {
  subject: string;
  body: string;
}

// ─── FILL IN YOUR EMAIL TEMPLATE BELOW ───────────────────────────────────────
const VALUE_PROPOSITION = `[YOUR VALUE PROPOSITION HERE — What do you offer? What problem do you solve?]`;
const CALL_TO_ACTION = `[YOUR CTA HERE — e.g. "Would you be open to a 15-min call this week?"]`;
const SIGN_OFF = `[YOUR SIGN-OFF HERE — e.g. "Best,\nRahul\nFounder, YourCompany\nyourwebsite.com"]`;
// ─────────────────────────────────────────────────────────────────────────────

export async function generateEmail(input: EmailInput): Promise<EmailOutput> {
  const prompt = `You are an outreach email copywriter. Write a personalized cold email using the company context below. Return ONLY valid JSON with keys "subject" and "body". No markdown, no explanation, just the JSON object.

Company: ${input.companyName}
Contact: ${input.contactName}
Industry: ${input.industry}
Specialties: ${input.specialties}
LinkedIn About: ${input.aboutText}

EMAIL TEMPLATE TO FOLLOW:
Subject: [Write a concise, personalized subject line — not generic]

Hi ${input.contactName},

[OPENING LINE — 1 sentence referencing something specific about ${input.companyName}]

[PERSONALIZED SECTION — 2-3 sentences connecting their work in ${input.industry} to our offering. Reference their actual About section details. DO NOT be generic. DO NOT say "I came across your profile."]

${VALUE_PROPOSITION}

${CALL_TO_ACTION}

${SIGN_OFF}`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = (message.content[0] as { text: string }).text.trim();
  const cleaned = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned) as EmailOutput;
}
```

---

### 5. Mailer — `src/lib/mailer.ts`

```typescript
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendEmail({
  to,
  subject,
  body,
}: {
  to: string;
  subject: string;
  body: string;
}) {
  await transporter.sendMail({
    from: `"Your Name" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text: body,
    // html: `<p>${body.replace(/\n/g, "<br>")}</p>`, // optional HTML version
  });
}
```

**Alternative — SendGrid** (better for cold outreach deliverability):

```typescript
import sgMail from "@sendgrid/mail";
sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export async function sendEmail({ to, subject, body }: { to: string; subject: string; body: string }) {
  await sgMail.send({ to, from: "you@yourdomain.com", subject, text: body });
}
```

---

### 6. Trigger.dev Config — `trigger.config.ts`

```typescript
import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "your-trigger-project-ref", // from Trigger.dev dashboard
  runtime: "node",
  logLevel: "log",
  maxDuration: 300,
  dirs: ["./src/trigger"],
});
```

---

## Google Sheet — Required Structure

Row 1 must have these exact headers:

```
A: company_name
B: contact_name
C: contact_email
D: company_domain
E: linkedin_url       ← leave blank to auto-resolve
F: status             ← leave blank for new leads
G: email_sent_date    ← filled by script
H: error_log          ← filled by script on failure
```

---

## Deployment — Trigger.dev

```bash
# 1. Install Trigger.dev CLI
npm install -g @trigger.dev/cli

# 2. Login
npx trigger.dev@latest login

# 3. Initialize project (if not already)
npx trigger.dev@latest init

# 4. Deploy
npx trigger.dev@latest deploy

# 5. Set env vars in dashboard
# → Trigger.dev Dashboard → Project → Environment Variables
# → Add all variables from the .env section above
```

The cron will run automatically once deployed. You can also trigger a manual test run from the Trigger.dev dashboard.

---

## Error Handling Strategy

- **Per-lead try/catch:** One failed lead never crashes the batch.
- **LinkedIn not found:** Throws error → caught → status set to `"error"`, error logged in sheet.
- **ScraperAPI timeout:** 30s timeout on axios call. On failure, log and skip.
- **AI parse error:** Wrap `JSON.parse` in try/catch, retry once before marking as error.
- **Email send failure:** Caught → logged → lead marked `"error"` for manual review.
- **All errors visible in:** Trigger.dev run logs (dashboard) + Google Sheet `error_log` column.

---

## Rate Limits Reference

| Service | Free Limit | Notes |
|---------|-----------|-------|
| ScraperAPI | 5,000 credits/month | `render=true` = 5 credits/call → ~33 scrapes/day |
| Google Custom Search | 100 queries/day | Enough for ~100 new leads/day |
| Anthropic Claude | Pay-per-token | Sonnet ~$3/million input tokens — cheap for emails |
| Gmail SMTP | 500 emails/day | Use SendGrid free (100/day) for better deliverability |
| Google Sheets API | 300 req/min | Not a concern |

---

## Deployment Checklist

- [ ] Google Sheet created with correct headers (A–H)
- [ ] Google Service Account created, JSON key downloaded, sheet shared with service account email
- [ ] ScraperAPI account created, key added to env
- [ ] Google Custom Search Engine created, restricted to `linkedin.com`
- [ ] Anthropic API key added to env
- [ ] Email template filled in (`email-gen.ts` — Value Proposition, CTA, Sign-off)
- [ ] SMTP or SendGrid credentials added to env
- [ ] All env vars added to Trigger.dev dashboard
- [ ] `npx trigger.dev@latest deploy` run successfully
- [ ] Manual test triggered from Trigger.dev dashboard with 2-3 leads
- [ ] SPF/DKIM/DMARC set up on sending domain

---

## Testing Protocol

1. Add 2-3 test leads to the sheet with your own email as `contact_email`.
2. Comment out `sendEmail()` in `outreach.ts`, `console.log` the email body instead.
3. Verify subject + body look correct for each lead.
4. Re-enable `sendEmail()`, run again, check your inbox.
5. Only then populate real leads and let the cron run.

---

## Future Improvements

- **Reply detection:** Gmail API watch inbox, update sheet status to `"replied"` on reply.
- **Follow-up sequence:** Second Trigger.dev cron checks `email_sent_date`, sends follow-up after N days if status is still `"sent"`.
- **Lead scoring:** Add a `score` column, sort by score descending before slicing the batch.
- **CRM push:** After send, POST lead data to HubSpot/Pipedrive REST API.
- **Bounce webhook:** SendGrid Event Webhook → Trigger.dev webhook task → mark bounced leads in sheet.
