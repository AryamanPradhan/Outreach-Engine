import { schedules } from "@trigger.dev/sdk/v3";
import { fetchPendingLeads, updateLeadStatus } from "../lib/sheets";
import { generateEmail } from "../lib/email-gen";
import { findWebsiteEmails } from "../lib/firecrawl";
import { sendEmail } from "../lib/mailer";

const MAX_ATTEMPTS = 2;
const DELAY_MS = 30_000; // 30s between sends keeps each run under 15 min (free tier cap)

// MAX_EMAILS_PER_RUN is the daily cap. Two runs per day split it evenly.
const BATCH_SIZE = Math.floor(parseInt(process.env.MAX_EMAILS_PER_RUN ?? "22") / 2);

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

    if (!lead.company_description.trim()) {
      console.warn(`⚠️ No company description for ${lead.company_name} — skipping`);
      await updateLeadStatus(lead.rowIndex, "skipped: no description");
      continue;
    }

    let recipients = dedupeEmails([lead.contact_email]);
    try {
      const websiteEmails = await findWebsiteEmails(lead.company_domain);
      if (websiteEmails.length) {
        recipients = dedupeEmails([...recipients, ...websiteEmails]);
        console.log(`🔎 ${lead.company_domain}: found ${websiteEmails.join(", ")}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`🔎 Scrape skipped for ${lead.company_domain}: ${msg}`);
    }

    if (recipients.length === 0) {
      console.warn(`⚠️ No email found for ${lead.company_name} — skipping`);
      await updateLeadStatus(lead.rowIndex, "No email found");
      await new Promise((res) => setTimeout(res, DELAY_MS));
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

    await new Promise((res) => setTimeout(res, DELAY_MS));
  }

  console.log(`Run complete. Processed ${batch.length}/${leads.length} leads.`);
}

// 9:00 AM IST (03:30 UTC) — first half of daily cap
export const morningOutreachJob = schedules.task({
  id: "auto-outreach-morning",
  cron: "30 3 * * *",
  maxDuration: 900,
  run: () => runOutreachBatch(BATCH_SIZE),
});

// 11:00 AM IST (05:30 UTC) — second half of daily cap
export const afternoonOutreachJob = schedules.task({
  id: "auto-outreach-afternoon",
  cron: "30 5 * * *",
  maxDuration: 900,
  run: () => runOutreachBatch(BATCH_SIZE),
});
