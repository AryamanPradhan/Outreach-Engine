import { schedules } from "@trigger.dev/sdk/v3";
import { fetchPendingLeads, updateLeadStatus } from "../lib/sheets";
import { generateEmail } from "../lib/email-gen";
import { findWebsiteEmails } from "../lib/firecrawl";
import { sendEmail } from "../lib/mailer";

const REQUIRED_ENV_VARS = [
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
  "GOOGLE_SHEET_ID",
  "OPENAI_API_KEY",
  "SMTP_USER",
  "SMTP_PASS",
  "FIRECRAWL_API_KEY",
];

for (const v of REQUIRED_ENV_VARS) {
  if (!process.env[v]) {
    throw new Error(`Missing required env var: ${v}`);
  }
}

const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function isValidEmail(email: string): boolean {
  return EMAIL_FORMAT_RE.test(email) && email.length <= 254;
}

const MAX_ATTEMPTS = 2;
// Jittered delay between sends. Kept short enough that a full batch (plus
// per-lead scrape + generation time) stays under the 15 min maxDuration, but
// long enough — and randomized, to avoid a robotic cadence — that Gmail does
// not flag the run as spam at this low volume (~11 sends/run, 22/day).
const DELAY_MIN_MS = 15_000;
const DELAY_MAX_MS = 25_000;
const sendDelayMs = () =>
  DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS));

// MAX_EMAILS_PER_RUN is the daily cap. Two runs per day split it evenly
// (40/day → 20 per run: morning 20, afternoon 20).
const BATCH_SIZE = Math.floor(parseInt(process.env.MAX_EMAILS_PER_RUN ?? "40") / 2);

function dedupeEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const e = raw.trim();
    const key = e.toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(e);
    }
  }
  return out;
}

async function runOutreachBatch(batchSize: number) {
  const leads = await fetchPendingLeads();
  console.log(`Found ${leads.length} pending leads — processing ${batchSize}`);
  const batch = leads.slice(0, batchSize);

  for (let i = 0; i < batch.length; i++) {
    const lead = batch[i];
    const isLast = i === batch.length - 1;
    const throttle = () =>
      isLast ? Promise.resolve() : new Promise((res) => setTimeout(res, sendDelayMs()));

    if (!lead.company_description.trim()) {
      console.warn(`⚠️ No company description for ${lead.company_name} — skipping`);
      await updateLeadStatus(lead.rowIndex, "skipped: no description");
      continue;
    }

    let recipients = dedupeEmails([lead.contact_email]).filter(isValidEmail);
    try {
      const websiteEmails = await findWebsiteEmails(lead.company_domain);
      if (websiteEmails.length) {
        recipients = dedupeEmails([...recipients, ...websiteEmails]).filter(isValidEmail);
        console.log(`🔎 ${lead.company_domain}: found ${websiteEmails.join(", ")}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`🔎 Scrape skipped for ${lead.company_domain}: ${msg}`);
    }

    if (recipients.length === 0) {
      console.warn(`⚠️ No email found for ${lead.company_name} — skipping`);
      await updateLeadStatus(lead.rowIndex, "No email found");
      await throttle();
      continue;
    }

    let lastError = "";
    let sent = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !sent; attempt++) {
      try {
        const email = await generateEmail({
          companyName: lead.company_name,
          companyDescription: lead.company_description,
        });

        await sendEmail({
          to: recipients[0],
          bcc: recipients.slice(1),
          subject: email.subject,
          body: email.body,
          accountIndex: 0,
        });

        // Mark AFTER send succeeds — in its own try/catch so a sheet hiccup
        // never causes the email to be re-sent on retry.
        sent = true;
        console.log(`✅ Sent to ${recipients.length} recipient(s): ${recipients.join(", ")}`);
        try {
          await updateLeadStatus(lead.rowIndex, "sent");
        } catch (markErr: unknown) {
          const msg = markErr instanceof Error ? markErr.message : String(markErr);
          console.error(`⚠️ Email sent but failed to mark row ${lead.rowIndex}: ${msg}`);
        }
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);
        console.error(`⚠️ Attempt ${attempt}/${MAX_ATTEMPTS} failed for ${lead.contact_email}: ${lastError}`);
      }
    }

    if (!sent) {
      console.error(`❌ Giving up on ${lead.contact_email} after ${MAX_ATTEMPTS} attempts`);
      await updateLeadStatus(lead.rowIndex, `error: ${lastError.slice(0, 200)}`);
    }

    await throttle();
  }

  console.log(`Run complete. Processed ${batch.length}/${leads.length} leads.`);
}

// 9:00 AM IST (03:30 UTC), Mon–Fri only — first half of daily cap
export const morningOutreachJob = schedules.task({
  id: "auto-outreach-morning",
  cron: "30 3 * * 1-5",
  maxDuration: 900,
  run: () => runOutreachBatch(BATCH_SIZE),
});

// 11:00 AM IST (05:30 UTC), Mon–Fri only — second half of daily cap
export const afternoonOutreachJob = schedules.task({
  id: "auto-outreach-afternoon",
  cron: "30 5 * * 1-5",
  maxDuration: 900,
  run: () => runOutreachBatch(BATCH_SIZE),
});
