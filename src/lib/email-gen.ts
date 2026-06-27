import OpenAI from "openai";
import { buildEmailPrompt, assembleEmailBody, EmailParts } from "./prompt-template";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface EmailInput {
  companyName: string;
  companyDescription: string;
}

interface EmailOutput {
  subject: string;
  body: string;
}

const MAX_INPUT_LENGTH = 2000;
const MAX_SUBJECT_LENGTH = 200;
const MAX_BLOCK_LENGTH = 800;
const HTML_TAG_RE = /<[^>]+>/g;

function sanitizeInput(str: string): string {
  return str
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .slice(0, MAX_INPUT_LENGTH);
}

// Clean a single LLM-written field: strip control chars and HTML, cap length.
function cleanField(str: string, maxLength: number): string {
  return str
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(HTML_TAG_RE, "")
    .trim()
    .slice(0, maxLength);
}

// The LLM writes only Blocks 1 and 2 (intro, painPoint) plus the subject.
function validateEmailParts(parsed: unknown): EmailParts {
  const obj = parsed as Record<string, unknown>;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof obj.subject !== "string" ||
    typeof obj.intro !== "string" ||
    typeof obj.painPoint !== "string"
  ) {
    throw new Error("LLM output missing required subject/intro/painPoint string fields");
  }

  const subject = cleanField(obj.subject, MAX_SUBJECT_LENGTH);
  const intro = cleanField(obj.intro, MAX_BLOCK_LENGTH);
  const painPoint = cleanField(obj.painPoint, MAX_BLOCK_LENGTH);

  if (!subject || !intro || !painPoint) {
    throw new Error("LLM returned an empty subject, intro, or painPoint after sanitization");
  }

  return { subject, intro, painPoint };
}

export async function generateEmail(input: EmailInput): Promise<EmailOutput> {
  const companyName = sanitizeInput(input.companyName);
  const companyDescription = sanitizeInput(input.companyDescription);

  const prompt = buildEmailPrompt(companyName, companyDescription);

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.choices[0].message.content?.trim() ?? "";
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Failed to parse AI response as JSON: ${cleaned.slice(0, 200)}`);
    parsed = JSON.parse(match[0]);
  }

  const parts = validateEmailParts(parsed);
  return { subject: parts.subject, body: assembleEmailBody(parts) };
}
