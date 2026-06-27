// Cold outreach prompt + email template. Kept separate from email-gen.ts so the
// copy can be edited without touching parsing/validation logic. This is a normal
// TS module, so it is bundled at build time, no runtime file read, no perf cost.
//
// Only Blocks 1 (intro) and 2 (pain point) are written by the LLM. Blocks 3
// (Aryaman's introduction) and 4 (CTA) are fixed copy, assembled in code below,
// so they always come out verbatim and the LLM cannot paraphrase or reword them.

export interface EmailParts {
  subject: string;
  intro: string; // Block 1
  painPoint: string; // Block 2
}

// Block 3 — Aryaman's introduction (fixed, verbatim).
const PITCH_BLOCK =
  "I work with B2B businesses to help them integrate AI and streamline workflows to eliminate manual work. One of the systems I'm currently building is a speed to lead system — the moment a lead reaches out, they're instantly enriched and qualified against your company's criteria. If they're a fit, a welcome email goes out and your team gets notified right away.";

// Block 4 — CTA (fixed, verbatim).
const CTA_BLOCK =
  "If this is something worth exploring for your business, would you be open to a quick 15-minute call this week?";

const SIGN_OFF = "Best,\nAryaman";

// Prompt the LLM to write ONLY the two dynamic blocks plus a subject line.
export function buildEmailPrompt(
  companyName: string,
  companyDescription: string
): string {
  return `You are writing the opening of a cold outreach email on behalf of Aryaman, who helps B2B businesses integrate AI and streamline workflows to eliminate manual work.

You write ONLY two short paragraphs plus a subject line. The rest of the email (Aryaman's introduction, the call to action, and the sign-off) is fixed and added automatically after your text, so do not write it.

COMPANY: ${companyName}
COMPANY DESCRIPTION: ${companyDescription}

Write these three fields:

subject: A short subject line tied directly to the observation in the intro.

intro (Block 1): A sharp, specific observation about the company drawn from the description: a milestone, a scale indicator, what they do, or a known challenge for their type of business. If the description contains a concrete number or stat, anchor on that. 1 to 2 sentences.

painPoint (Block 2): Connect that observation to an operational pain point their team likely faces at that scale or in their industry. Keep it specific to them. 1 to 2 sentences. This must read as a separate paragraph from the intro, never merge the two.

HARD RULES:
- intro and painPoint are 1 to 2 sentences each. Be concise.
- Use ONLY information explicitly present in the company description. Do not invent or assume anything.
- Do not open with "It's impressive to see..." or generic compliments.
- No dashes of any kind (no hyphens, no en dashes, no em dashes). Rewrite to avoid them.
- No bullet points.
- No buzzwords: do not use innovative, cutting-edge, game-changer, synergy, leverage, or empower.
- Do not write a greeting, Aryaman's introduction, a call to action, or a sign-off. Only subject, intro, and painPoint.

Return ONLY valid JSON with keys "subject", "intro", and "painPoint". No markdown, no explanation, just the JSON object.`;
}

// Assemble the final email body from the LLM-written blocks plus fixed copy.
export function assembleEmailBody(parts: EmailParts): string {
  return `Hi,

${parts.intro}

${parts.painPoint}

${PITCH_BLOCK}

${CTA_BLOCK}

${SIGN_OFF}`;
}
