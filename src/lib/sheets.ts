import { google } from "googleapis";

const auth = new google.auth.JWT(
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  undefined,
  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  ["https://www.googleapis.com/auth/spreadsheets"]
);

const sheets = google.sheets({ version: "v4", auth });
const SHEET_ID = process.env.GOOGLE_SHEET_ID!;

// Actual sheet columns (no tab prefix = first tab):
// A:firstName  B:lastName  C:fullName  D:title  E:position  F:seniority
// G:email  H:emailStatus  I:phone  J:linkedinUrl  K:personCountry
// L:companyName  M:companyDomain  N:companyCountry  O:companyDescription
// P:companyLinkedinUrl  Q:companySize  R:companySizeRange  S:annualRevenue
// T:Reachout  ← gate column: only process when empty
const READ_RANGE = "A2:T";
const REACHOUT_COL = "T";

export interface Lead {
  rowIndex: number;
  contact_name: string;        // C: fullName
  contact_email: string;       // G: email (may be empty — website scrape is fallback)
  company_name: string;        // L: companyName
  company_domain: string;      // M: companyDomain
  company_description: string; // O: companyDescription
  reachout: string;            // T: Reachout
}

export async function fetchPendingLeads(): Promise<Lead[]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: READ_RANGE,
  });

  const rows = res.data.values || [];
  return rows
    .map((row, i) => ({
      rowIndex: i + 2,
      contact_name: row[2] || "",        // C
      contact_email: row[6] || "",       // G
      company_name: row[11] || "",       // L
      company_domain: row[12] || "",     // M
      company_description: row[14] || "", // O
      reachout: row[19] || "",           // T
    }))
    .filter((lead) => lead.reachout.trim() === ""); // only gate on Reachout being empty
}

export async function updateLeadStatus(
  rowIndex: number,
  reachoutValue: string // "sent" | "error: <message>"
) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${REACHOUT_COL}${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: { values: [[reachoutValue]] },
  });
}
