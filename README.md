# Auto Outreach

Automated cold email outreach that runs twice daily. Reads leads from a Google Sheet, finds contact emails by scraping company websites, generates personalised emails with OpenAI, and sends them via Gmail SMTP.

## How it works

1. Reads pending leads from Google Sheets (rows where the `Reachout` column is empty)
2. Scrapes the company's website via Firecrawl to find additional contact emails
3. Generates a personalised cold email using OpenAI GPT-4o-mini
4. Sends via Nodemailer (Gmail SMTP)
5. Marks the row as `sent` or `error: <reason>` in the sheet

Two scheduled runs per day via Trigger.dev:
- **9:00 AM IST** — first 25 leads
- **11:00 AM IST** — next 25 leads

## Stack

- **Runtime**: Node.js + TypeScript
- **Scheduler**: Trigger.dev (cron jobs)
- **Data**: Google Sheets API
- **Scraping**: Firecrawl
- **Email generation**: OpenAI GPT-4o-mini
- **Email sending**: Nodemailer (Gmail SMTP)

## Project structure

```
src/
  trigger/
    outreach.ts       # Main scheduled job — orchestrates the daily run
  lib/
    sheets.ts         # Google Sheets read/write
    firecrawl.ts      # Website scraping for contact emails
    email-gen.ts      # OpenAI prompt and email generation
    mailer.ts         # Email sending via SMTP
trigger.config.ts
docs/
  email-style.md      # Cold email style guide (Nick Saraev style)
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in all values:

```bash
cp env.example .env
```

| Variable | Description |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email for Sheets API |
| `GOOGLE_PRIVATE_KEY` | Service account private key |
| `GOOGLE_SHEET_ID` | ID of the Google Sheet containing leads |
| `OPENAI_API_KEY` | OpenAI API key |
| `FIRECRAWL_API_KEY` | Firecrawl API key |
| `SMTP_HOST` | SMTP host (default: smtp.gmail.com) |
| `SMTP_PORT` | SMTP port (default: 587) |
| `SMTP_USER` | Gmail address |
| `SMTP_PASS` | Gmail app password |
| `SENDER_NAME` | Display name on sent emails |
| `TRIGGER_PROJECT_REF` | Trigger.dev project ref |
| `MAX_EMAILS_PER_RUN` | Daily email cap (split across 2 runs) |

### 3. Google Sheet format

The sheet must have columns in this exact order:

| A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q | R | S | T |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| firstName | lastName | fullName | title | position | seniority | email | emailStatus | phone | linkedinUrl | personCountry | companyName | companyDomain | companyCountry | companyDescription | companyLinkedinUrl | companySize | companySizeRange | annualRevenue | Reachout |

Leads are processed when column `T` (Reachout) is empty.

### 4. Local development

```bash
npx trigger.dev@latest dev
```

### 5. Deploy

```bash
npx trigger.dev@4.4.6 deploy
```

Add all environment variables to your Trigger.dev dashboard before deploying.

## Safety

- `MAX_EMAILS_PER_RUN` caps the daily send volume — do not remove it
- Test with your own email address before pointing at real leads
- Never commit `.env` — it is git-ignored
